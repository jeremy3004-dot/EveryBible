#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE(EveryBibleAudioNowPlayingModule, RCTEventEmitter)

RCT_EXTERN_METHOD(syncBibleNowPlaying:(NSDictionary *)payload)
RCT_EXTERN_METHOD(clearBibleNowPlaying)

@end
