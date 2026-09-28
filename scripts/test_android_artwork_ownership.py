#!/usr/bin/env python3
"""Compile the installed/staged Android artwork methods with real Kotlin coroutines.

Android builders, sessions, and bitmap decoding are test doubles. updateMetadata,
onDestroy, and loadArtwork are extracted verbatim; Dispatchers.IO and cancellation
are real. No Android build/device, downloads, or installed dependency edits occur.
Supply a Gradle modules-2/files-2.1 cache containing the pinned compiler jars.
"""
import argparse
from pathlib import Path
import subprocess
import tempfile

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--service-source", type=Path, required=True)
parser.add_argument("--gradle-cache", type=Path, required=True)
parser.add_argument("--java", default="java")
args = parser.parse_args()
cache = args.gradle_cache
output = tempfile.TemporaryDirectory(prefix="everybible-artwork-test-")
base = Path(output.name)
source = args.service_source.read_text()


def method(signature):
    start = source.index(signature)
    opening = source.index("{", start)
    depth = 1
    end = opening + 1
    while depth:
        depth += (source[end] == "{") - (source[end] == "}")
        end += 1
    return source[start:end]


update = method("  fun updateMetadata(")
destroy = method("  override fun onDestroy()")
loader = method("  private suspend fun loadArtwork(")
constants = [
    "TITLE", "ARTIST", "ALBUM", "GENRE", "DATE", "DURATION",
    "TRACK_NUMBER", "NUM_TRACKS", "ALBUM_ART",
]
stubs='''import kotlinx.coroutines.*
import kotlin.coroutines.*
import java.io.InputStream
import java.util.concurrent.CompletableFuture
typealias Bitmap = String
class GateStream:InputStream() {
 val entered=CompletableDeferred<Unit>()
 val result=CompletableFuture<Bitmap?>()
 override fun read()=-1
}
object android {
 object net {object Uri {fun parse(uri:String)=uri}}
 object graphics {object BitmapFactory {
  fun decodeStream(input:InputStream):Bitmap? {
   val gate=input as GateStream
   gate.entered.complete(Unit)
   return gate.result.get()
  }
 }}
}
class Resolver {
 val gates=mutableMapOf<String,GateStream>()
 fun openInputStream(uri:String):InputStream=gates.getValue(uri)
}
class MediaMetadataCompat(val fields: Map<String,Any>) {
 companion object { CONSTANTS }
 class Builder {
  val fields=mutableMapOf<String,Any>()
  fun putString(k:String,v:String) {fields[k]=v}
  fun putLong(k:String,v:Long) {fields[k]=v}
  fun putBitmap(k:String,v:Any) {fields[k]=v}
  fun build()=MediaMetadataCompat(fields.toMap())
 }
}
class Session {
 val history=mutableListOf<String>()
 var released=false
 fun setMetadata(m:MediaMetadataCompat) {history.add(m.fields["TITLE"].toString())}
 fun release() {released=true}
}
open class Base {open fun onDestroy() {}}
class Host(val serviceScope:CoroutineScope):Base() {
 var artworkLoadJob:Job?=null
 var mediaMetadata=MediaMetadataCompat(emptyMap())
 val mediaSession=Session()
 var isForegroundService=false
 val mediaActionReceiver=Any()
 fun unregisterReceiver(x:Any) {}
 fun updateNotification() {}
 val contentResolver=Resolver()
 val gates get()=contentResolver.gates
 LOADER
 EXTRA_FIELDS
 UPDATE
 DESTROY
}
fun main()=runBlocking {
 val failures=mutableListOf<String>()
 suspend fun run(name:String, body:suspend (Host)->Unit) {
  val h=Host(CoroutineScope(coroutineContext+SupervisorJob()))
  try {body(h);println("PASS $name")} catch(e:Throwable) {failures.add(name+": "+e.message);println("FAIL $name: ${e.message}")} finally {h.serviceScope.cancel();yield()}
 }
 fun art(title:String,uri:String)=mapOf<String,Any>("title" to title,"artwork" to mapOf("uri" to uri))
 suspend fun start(h:Host,title:String,uri:String):Job {
  h.gates[uri]=GateStream();h.updateMetadata(art(title,uri))
  h.gates.getValue(uri).entered.await()
  return h.artworkLoadJob!!
 }
 run("no-artwork replacement retains neutral title") {h->
  val old=start(h,"Genesis 1","old")
  h.updateMetadata(mapOf("title" to "Now playing"))
  h.gates.getValue("old").result.complete("bitmap");old.join()
  check(h.mediaSession.history.last()=="Now playing") {h.mediaSession.history}
 }
 run("artwork replacement never republishes cancelled title") {h->
  val old=start(h,"Genesis 1","old")
  val current=start(h,"Genesis 2","new")
  h.gates.getValue("old").result.complete("bitmap");old.join()
  h.gates.getValue("new").result.complete("bitmap");current.join()
  check("Genesis 1" !in h.mediaSession.history) {h.mediaSession.history}
  check(h.mediaSession.history.last()=="Genesis 2") {h.mediaSession.history}
 }
 run("destroyed service never publishes cancelled artwork") {h->
  val old=start(h,"Genesis 1","old")
  h.onDestroy()
  h.gates.getValue("old").result.complete("bitmap");old.join()
  check(h.mediaSession.history.isEmpty()) {h.mediaSession.history}
 }
 run("current artwork publishes title and bitmap") {h->
  val current=start(h,"Genesis 2","new")
  h.gates.getValue("new").result.complete("bitmap");current.join()
  check(h.mediaMetadata.fields["TITLE"]=="Genesis 2")
  check(h.mediaMetadata.fields["ALBUM_ART"]=="bitmap")
 }
 run("current artwork failure retains title without bitmap") {h->
  val current=start(h,"Genesis 2","new")
  h.gates.getValue("new").result.completeExceptionally(java.io.IOException("read failed"));current.join()
  check(h.mediaMetadata.fields["TITLE"]=="Genesis 2")
  check("ALBUM_ART" !in h.mediaMetadata.fields)
 }
 run("empty metadata reset retires pending artwork") {h->
  val old=start(h,"Genesis 1","old")
  h.updateMetadata(emptyMap())
  h.gates.getValue("old").result.complete("bitmap");old.join()
  check(h.mediaMetadata.fields.isEmpty()) {h.mediaMetadata.fields}
 }
 run("metadata after destruction cannot publish") {h->
  h.onDestroy();h.updateMetadata(mapOf("title" to "Genesis 2"))
  check(h.mediaSession.history.isEmpty()) {h.mediaSession.history}
 }
 check(failures.isEmpty()) {failures.joinToString("; ")}
}
'''
stubs = (stubs
    .replace("CONSTANTS", "\n".join(
        f'const val METADATA_KEY_{key}="{key}"' for key in constants
    ))
    .replace(" UPDATE", update)
    .replace(" DESTROY", destroy)
    .replace(" LOADER", loader)
)
# Include only fields present in the source under test; the baseline has no guards.
fields = "\n".join(
    line for line in source.splitlines()
    if any(name in line for name in (
        "private var metadataGeneration", "private var serviceDestroyed"
    ))
)
stubs = stubs.replace(" EXTRA_FIELDS", fields)
(base / "Repro.kt").write_text(stubs)


def jar(group, name, version):
    matches = sorted((cache / group / name / version).glob("*/*.jar"))
    if not matches:
        raise SystemExit(f"Missing cached dependency: {group}/{name}/{version}")
    return matches[0]


jars = [
    jar("org.jetbrains.kotlin", "kotlin-compiler-embeddable", "2.1.20"),
    jar("org.jetbrains.kotlin", "kotlin-stdlib", "2.1.20"),
    jar("org.jetbrains.kotlin", "kotlin-script-runtime", "2.1.20"),
    jar("org.jetbrains.kotlin", "kotlin-reflect", "2.1.20"),
    jar("org.jetbrains.intellij.deps", "trove4j", "1.0.20200330"),
    jar("org.jetbrains", "annotations", "13.0"),
    jar("org.jetbrains.kotlinx", "kotlinx-coroutines-core-jvm", "1.9.0"),
]
classpath = ":".join(map(str, jars))
try:
    subprocess.run([
        args.java, "-cp", classpath, "org.jetbrains.kotlin.cli.jvm.K2JVMCompiler",
        "-no-stdlib", "-no-reflect", "-classpath", classpath,
        "-d", str(base / "repro.jar"), str(base / "Repro.kt"),
    ], check=True, timeout=60)
    subprocess.run([
        args.java, "-cp", str(base / "repro.jar") + ":" + classpath, "ReproKt",
    ], check=True, timeout=30)
finally:
    output.cleanup()
