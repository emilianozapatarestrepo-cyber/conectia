import SwiftUI
import FirebaseCore

@main
struct conectiaApp: App {

    @StateObject private var sessionManager = SessionManager()

    init() { FirebaseApp.configure() }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(sessionManager)
        }
    }
}
