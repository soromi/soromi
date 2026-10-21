import ExpoModulesCore
import UIKit

/// A little time for the app to finish something before iOS suspends it: an answer given from a
/// notification's button, which has to reach the computer over the network.
public final class BackgroundTimeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("BackgroundTime")

    // Up to `seconds` (iOS gives some thirty at most), or until `end`.
    AsyncFunction("begin") { (seconds: Double) in
      BackgroundTime.shared.begin(for: seconds)
    }
    .runOnQueue(.main)

    AsyncFunction("end") {
      BackgroundTime.shared.end()
    }
    .runOnQueue(.main)
  }
}

/// The one stretch of background time the app holds, if it holds one. Used on the main queue.
final class BackgroundTime {
  static let shared = BackgroundTime()

  private var task: UIBackgroundTaskIdentifier = .invalid
  private var deadline: DispatchWorkItem?

  func begin(for seconds: Double) {
    end()
    task = UIApplication.shared.beginBackgroundTask(withName: "soromi.answer") { [weak self] in
      self?.end()
    }
    let item = DispatchWorkItem { [weak self] in
      self?.end()
    }
    deadline = item
    DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: item)
  }

  func end() {
    deadline?.cancel()
    deadline = nil
    guard task != .invalid else {
      return
    }
    UIApplication.shared.endBackgroundTask(task)
    task = .invalid
  }
}
