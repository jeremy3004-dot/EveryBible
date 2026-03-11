import Foundation
import UIKit

@objc(EveryBiblePrivacyModule)
class EveryBiblePrivacyModule: NSObject {
  private let discreetIconName = "DiscreetAppIcon"

  @objc
  static func requiresMainQueueSetup() -> Bool {
    true
  }

  @objc
  func getCurrentAppIcon(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      if #available(iOS 10.3, *), UIApplication.shared.supportsAlternateIcons {
        let currentMode =
          UIApplication.shared.alternateIconName == self.discreetIconName ? "discreet" : "standard"
        resolve(currentMode)
        return
      }

      resolve("standard")
    }
  }

  @objc
  func setAppIcon(
    _ mode: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.main.async {
      if #available(iOS 10.3, *) {
        let application = UIApplication.shared
        guard application.supportsAlternateIcons else {
          resolve(false)
          return
        }

        let iconName = mode == "discreet" ? self.discreetIconName : nil

        if application.alternateIconName == iconName {
          resolve(true)
          return
        }

        application.setAlternateIconName(iconName) { error in
          if let error {
            reject("ICON_CHANGE_FAILED", "Unable to change the iOS app icon.", error)
            return
          }

          resolve(true)
        }
        return
      }

      resolve(false)
    }
  }
}
