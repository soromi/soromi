import ExpoModulesCore
import UIKit

/// iOS starts the app in the background for a notification's button that does not bring it up,
/// and the answer has to be sent before the app is suspended, with the app's code still to load.
/// The time for both is asked for here, at launch; the app ends it once the answer has gone.
public class BackgroundTimeAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  /// What iOS gives at most, with room to spare.
  private static let launchSeconds = 25.0

  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    if application.applicationState == .background {
      BackgroundTime.shared.begin(for: BackgroundTimeAppDelegateSubscriber.launchSeconds)
    }
    return true
  }
}
