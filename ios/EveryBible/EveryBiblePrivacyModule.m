#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(EveryBiblePrivacyModule, NSObject)

RCT_EXTERN_METHOD(
  getCurrentAppIcon:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)

RCT_EXTERN_METHOD(
  setAppIcon:(NSString *)mode
  resolver:(RCTPromiseResolveBlock)resolve
  rejecter:(RCTPromiseRejectBlock)reject
)

@end
