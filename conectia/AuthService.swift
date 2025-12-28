import Foundation
import FirebaseAuth

/// A lightweight, testable authentication service for Firebase Authentication.
/// Uses Firebase's async/await APIs and returns Result for ergonomic error handling.
public protocol AuthServicing {
    func registerUser(email: String, password: String) async -> Result<Void, Error>
    func loginUser(email: String, password: String) async -> Result<Void, Error>
    func sendPasswordReset(email: String) async -> Result<Void, Error>
    func signOut() -> Result<Void, Error>
    var currentUserUID: String? { get }
    var isAuthenticated: Bool { get }
}

/// Default implementation backed by FirebaseAuth.
public final class AuthService: AuthServicing {

    public static let shared = AuthService()
    private let auth: Auth

    // MARK: - Init

    public init(auth: Auth = Auth.auth()) {
        self.auth = auth
    }

    // MARK: - Public API

    /// Registers a new user with email and password.
    /// - Returns: `.success(())` on success, or `.failure(Error)` with the underlying Firebase error.
    public func registerUser(email: String, password: String) async -> Result<Void, Error> {
        do {
            _ = try await auth.createUser(withEmail: email, password: password)
            return .success(())
        } catch {
            return .failure(error)
        }
    }

    /// Signs in an existing user with email and password.
    /// - Returns: `.success(())` on success, or `.failure(Error)` with the underlying Firebase error.
    public func loginUser(email: String, password: String) async -> Result<Void, Error> {
        do {
            _ = try await auth.signIn(withEmail: email, password: password)
            return .success(())
        } catch {
            return .failure(error)
        }
    }

    /// Sends a password reset email to the specified address.
    /// - Returns: `.success(())` on success, or `.failure(Error)` with the underlying Firebase error.
    public func sendPasswordReset(email: String) async -> Result<Void, Error> {
        do {
            try await auth.sendPasswordReset(withEmail: email)
            return .success(())
        } catch {
            return .failure(error)
        }
    }

    /// Signs out the current user.
    /// - Returns: `.success(())` on success, or `.failure(Error)` with the underlying Firebase error.
    public func signOut() -> Result<Void, Error> {
        do {
            try auth.signOut()
            return .success(())
        } catch {
            return .failure(error)
        }
    }

    /// The UID of the currently authenticated user, if any.
    public var currentUserUID: String? {
        auth.currentUser?.uid
    }

    /// Indicates whether a user is currently authenticated.
    public var isAuthenticated: Bool {
        auth.currentUser != nil
    }
}
