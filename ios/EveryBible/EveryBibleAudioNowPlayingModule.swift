import Foundation
import AVFoundation
import MediaPlayer
import React
import UIKit

@objc(EveryBibleAudioNowPlayingModule)
class EveryBibleAudioNowPlayingModule: RCTEventEmitter {
  private let eventName = "EveryBibleAudioNowPlayingCommand"
  private var hasListeners = false
  private var remoteCommandsConfigured = false
  private var lifecycleObserversConfigured = false
  private var latestPayload: NSDictionary?

  override static func requiresMainQueueSetup() -> Bool {
    true
  }

  override func supportedEvents() -> [String]! {
    [eventName]
  }

  override func startObserving() {
    hasListeners = true
    configureLifecycleObserversIfNeeded()
    configureRemoteCommandsIfNeeded()
  }

  override func stopObserving() {
    hasListeners = false
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }

  @objc
  func syncBibleNowPlaying(_ payload: NSDictionary) {
    DispatchQueue.main.async {
      self.latestPayload = payload
      self.configureLifecycleObserversIfNeeded()
      self.configureRemoteCommandsIfNeeded()
      self.activateAudioSession()
      self.configureEnabledCommands(from: payload)
      self.publishNowPlaying(from: payload)
    }
  }

  @objc
  func clearBibleNowPlaying() {
    DispatchQueue.main.async {
      self.latestPayload = nil
      MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
      if #available(iOS 13.0, *) {
        MPNowPlayingInfoCenter.default().playbackState = .stopped
      }
      self.disableCommands()
    }
  }

  private func configureLifecycleObserversIfNeeded() {
    guard !lifecycleObserversConfigured else {
      return
    }

    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleAppDidEnterBackground(_:)),
      name: UIApplication.didEnterBackgroundNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleAppWillEnterForeground(_:)),
      name: UIApplication.willEnterForegroundNotification,
      object: nil
    )
    // Handle AVAudioSession interruptions (phone calls, other audio apps, screen lock in some
    // configurations). When the interruption ends with shouldResume=true, send a 'play' command
    // back to JS so expo-av's Sound object can be resumed by useAudioPlayer.
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleAudioSessionInterruption(_:)),
      name: AVAudioSession.interruptionNotification,
      object: nil
    )
    lifecycleObserversConfigured = true
  }

  @objc
  private func handleAppDidEnterBackground(_ notification: Notification) {
    DispatchQueue.main.async {
      self.republishLatestNowPlayingSnapshot()
    }
  }

  @objc
  private func handleAppWillEnterForeground(_ notification: Notification) {
    DispatchQueue.main.async {
      self.republishLatestNowPlayingSnapshot()
    }
  }

  @objc
  private func handleAudioSessionInterruption(_ notification: Notification) {
    guard let userInfo = notification.userInfo,
      let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
      let type = AVAudioSession.InterruptionType(rawValue: typeValue)
    else {
      return
    }

    if type == .ended {
      // Check if iOS recommends resuming playback. This flag is present when interruption
      // ended in a way that allows audio to restart (e.g. phone call ended, screen unlock
      // on devices where lock triggers an interruption).
      let shouldResume: Bool
      if let optionsValue = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt {
        let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
        shouldResume = options.contains(.shouldResume)
      } else {
        // Older iOS versions or certain interruption types do not include the options key.
        // Default to resuming so playback is not permanently stuck after a call ends.
        shouldResume = true
      }

      if shouldResume && self.latestPayload != nil {
        DispatchQueue.main.async {
          self.activateAudioSession()
          self.republishLatestNowPlayingSnapshot()
          // Tell JS to resume expo-av playback. useAudioPlayer's
          // subscribeBibleNowPlayingRemoteCommands handler handles 'play' by
          // resuming if paused or replaying the current chapter.
          self.sendCommand("play")
        }
      }
    }
  }

  private func configureRemoteCommandsIfNeeded() {
    guard !remoteCommandsConfigured else {
      return
    }

    let center = MPRemoteCommandCenter.shared()
    center.playCommand.addTarget { [weak self] _ in
      self?.sendCommand("play")
      return .success
    }
    center.pauseCommand.addTarget { [weak self] _ in
      self?.sendCommand("pause")
      return .success
    }
    center.togglePlayPauseCommand.addTarget { [weak self] _ in
      self?.sendCommand("play")
      return .success
    }
    center.stopCommand.addTarget { [weak self] _ in
      self?.sendCommand("stop")
      return .success
    }
    center.nextTrackCommand.addTarget { [weak self] _ in
      self?.sendCommand("next")
      return .success
    }
    center.previousTrackCommand.addTarget { [weak self] _ in
      self?.sendCommand("previous")
      return .success
    }
    center.skipForwardCommand.preferredIntervals = [10]
    center.skipForwardCommand.addTarget { [weak self] _ in
      self?.sendCommand("seek-forward")
      return .success
    }
    center.skipBackwardCommand.preferredIntervals = [10]
    center.skipBackwardCommand.addTarget { [weak self] _ in
      self?.sendCommand("seek-backward")
      return .success
    }
    center.changePlaybackPositionCommand.addTarget { [weak self] commandEvent in
      guard let event = commandEvent as? MPChangePlaybackPositionCommandEvent else {
        return .commandFailed
      }

      self?.sendCommand("seek-position", positionSeconds: event.positionTime)
      return .success
    }

    remoteCommandsConfigured = true
    UIApplication.shared.beginReceivingRemoteControlEvents()
  }

  private func republishLatestNowPlayingSnapshot() {
    guard let payload = latestPayload else {
      return
    }

    activateAudioSession()
    configureEnabledCommands(from: payload)
    publishNowPlaying(from: payload)
  }

  private func publishNowPlaying(from payload: NSDictionary) {
    let nowPlayingInfo = buildNowPlayingInfo(from: payload)
    MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo

    if #available(iOS 13.0, *) {
      MPNowPlayingInfoCenter.default().playbackState = boolValue(payload, key: "isPlaying")
        ? .playing
        : .paused
    }
  }

  private func disableCommands() {
    let center = MPRemoteCommandCenter.shared()
    center.playCommand.isEnabled = false
    center.pauseCommand.isEnabled = false
    center.togglePlayPauseCommand.isEnabled = false
    center.stopCommand.isEnabled = false
    center.nextTrackCommand.isEnabled = false
    center.previousTrackCommand.isEnabled = false
    center.skipForwardCommand.isEnabled = false
    center.skipBackwardCommand.isEnabled = false
    center.changePlaybackPositionCommand.isEnabled = false
  }

  private func activateAudioSession() {
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(.playback, mode: .default, options: [.allowAirPlay, .allowBluetoothA2DP])
      try session.setActive(true)
    } catch {
      NSLog("EveryBibleAudioNowPlayingModule audio session error: %@", error.localizedDescription)
    }
  }

  private func configureEnabledCommands(from payload: NSDictionary) {
    let center = MPRemoteCommandCenter.shared()

    let duration = numberValue(payload, key: "durationSeconds") ?? 0
    let canSkipNext = boolValue(payload, key: "canSkipNext")
    let canSkipPrevious = boolValue(payload, key: "canSkipPrevious")

    center.playCommand.isEnabled = true
    center.pauseCommand.isEnabled = true
    center.togglePlayPauseCommand.isEnabled = true
    center.stopCommand.isEnabled = true
    center.nextTrackCommand.isEnabled = canSkipNext
    center.previousTrackCommand.isEnabled = canSkipPrevious
    center.skipForwardCommand.isEnabled = duration > 0
    center.skipBackwardCommand.isEnabled = duration > 0
    center.changePlaybackPositionCommand.isEnabled = duration > 0
  }

  private func buildNowPlayingInfo(from payload: NSDictionary) -> [String: Any] {
    let title = stringValue(payload, key: "title") ?? "Bible Audio"
    let artist = stringValue(payload, key: "artist") ?? "Every Bible"
    let albumTitle = stringValue(payload, key: "albumTitle") ?? "Every Bible"
    let elapsedSeconds = numberValue(payload, key: "elapsedSeconds") ?? 0
    let durationSeconds = numberValue(payload, key: "durationSeconds") ?? 0
    let playbackRate = numberValue(payload, key: "playbackRate") ?? 1
    let isPlaying = boolValue(payload, key: "isPlaying")

    var info: [String: Any] = [
      MPMediaItemPropertyTitle: title,
      MPMediaItemPropertyArtist: artist,
      MPMediaItemPropertyAlbumTitle: albumTitle,
      MPNowPlayingInfoPropertyElapsedPlaybackTime: elapsedSeconds,
      MPMediaItemPropertyPlaybackDuration: durationSeconds,
      MPNowPlayingInfoPropertyMediaType: MPNowPlayingInfoMediaType.audio.rawValue,
      MPNowPlayingInfoPropertyIsLiveStream: false,
      MPNowPlayingInfoPropertyDefaultPlaybackRate: playbackRate,
      MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? playbackRate : 0,
    ]

    if let image = artworkImage(from: payload) {
      info[MPMediaItemPropertyArtwork] = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
    }

    return info
  }

  private func artworkImage(from payload: NSDictionary) -> UIImage? {
    if let uriString = stringValue(payload, key: "artworkUri"),
      let url = URL(string: uriString),
      url.isFileURL,
      let image = UIImage(contentsOfFile: url.path)
    {
      return image
    }

    if let appIcon = UIImage(named: "AppIcon") {
      return appIcon
    }

    let bookId = stringValue(payload, key: "bookId") ?? "BIBLE"
    let title = stringValue(payload, key: "title") ?? "Bible Audio"
    let chapter = intValue(payload, key: "chapter") ?? 1
    return generatedArtwork(bookId: bookId, title: title, chapter: chapter)
  }

  private func generatedArtwork(bookId: String, title: String, chapter: Int) -> UIImage? {
    let renderer = UIGraphicsImageRenderer(size: CGSize(width: 1024, height: 1024))
    let hueSeed = bookId.unicodeScalars.map { Int($0.value) }.reduce(0, +) % 360
    let hue = CGFloat(hueSeed) / 360.0
    let background = UIColor(hue: hue, saturation: 0.42, brightness: 0.14, alpha: 1)
    let accent = UIColor(hue: hue, saturation: 0.55, brightness: 0.78, alpha: 1)

    return renderer.image { context in
      let rect = CGRect(origin: .zero, size: CGSize(width: 1024, height: 1024))
      context.cgContext.setFillColor(background.cgColor)
      context.cgContext.fill(rect)

      let gradientColors = [background.cgColor, accent.withAlphaComponent(0.22).cgColor] as CFArray
      let gradientSpace = CGColorSpaceCreateDeviceRGB()
      if let gradient = CGGradient(colorsSpace: gradientSpace, colors: gradientColors, locations: [0, 1]) {
        context.cgContext.drawLinearGradient(
          gradient,
          start: CGPoint(x: 80, y: 80),
          end: CGPoint(x: 944, y: 944),
          options: []
        )
      }

      let borderPath = UIBezierPath(roundedRect: rect.insetBy(dx: 48, dy: 48), cornerRadius: 88)
      accent.withAlphaComponent(0.28).setStroke()
      borderPath.lineWidth = 8
      borderPath.stroke()

      let symbolConfig = UIImage.SymbolConfiguration(pointSize: 320, weight: .bold)
      if let symbol = UIImage(systemName: "book.closed.fill", withConfiguration: symbolConfig)?
        .withTintColor(.white, renderingMode: .alwaysOriginal)
      {
        let symbolSize = symbol.size
        let symbolRect = CGRect(
          x: (rect.width - symbolSize.width) / 2,
          y: 210,
          width: symbolSize.width,
          height: symbolSize.height
        )
        symbol.draw(in: symbolRect)
      }

      let paragraph = NSMutableParagraphStyle()
      paragraph.alignment = .center

      let titleAttributes: [NSAttributedString.Key: Any] = [
      .font: UIFont.systemFont(ofSize: 96, weight: .bold),
        .foregroundColor: UIColor.white,
        .paragraphStyle: paragraph,
      ]
      let subtitleAttributes: [NSAttributedString.Key: Any] = [
        .font: UIFont.systemFont(ofSize: 42, weight: .semibold),
        .foregroundColor: UIColor.white.withAlphaComponent(0.85),
        .paragraphStyle: paragraph,
      ]

      let titleRect = CGRect(x: 96, y: 680, width: 832, height: 110)
      (title as NSString).draw(in: titleRect, withAttributes: titleAttributes)

      let chapterText = "Chapter \(chapter)"
      let chapterRect = CGRect(x: 96, y: 796, width: 832, height: 60)
      (chapterText as NSString).draw(in: chapterRect, withAttributes: subtitleAttributes)
    }
  }

  private func sendCommand(_ command: String, positionSeconds: Double? = nil) {
    guard hasListeners else {
      return
    }

    var body: [String: Any] = ["command": command]
    if let positionSeconds {
      body["positionSeconds"] = positionSeconds
    }

    sendEvent(withName: eventName, body: body)
  }

  private func stringValue(_ payload: NSDictionary, key: String) -> String? {
    payload[key] as? String
  }

  private func numberValue(_ payload: NSDictionary, key: String) -> Double? {
    if let number = payload[key] as? NSNumber {
      return number.doubleValue
    }

    if let double = payload[key] as? Double {
      return double
    }

    if let int = payload[key] as? Int {
      return Double(int)
    }

    return nil
  }

  private func intValue(_ payload: NSDictionary, key: String) -> Int? {
    if let number = payload[key] as? NSNumber {
      return number.intValue
    }

    if let int = payload[key] as? Int {
      return int
    }

    return nil
  }

  private func boolValue(_ payload: NSDictionary, key: String) -> Bool {
    if let bool = payload[key] as? Bool {
      return bool
    }

    if let number = payload[key] as? NSNumber {
      return number.boolValue
    }

    return false
  }
}
