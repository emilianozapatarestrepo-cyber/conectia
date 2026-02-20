import Foundation
import FirebaseAuth
import Combine

/// Maneja el estado global de sesión del usuario.
@MainActor
final class SessionManager: ObservableObject {

    @Published private(set) var isAuthenticated: Bool = false
    @Published private(set) var isCheckingAuth: Bool = true

    // Alias para alinearnos con el plan (isLoading).
    var isLoading: Bool { isCheckingAuth }
    
    // Standard access to user ID
    var currentUserId: String? { currentUser?.uid }

    // Rol y perfiles legacy (se mantienen mientras migramos a "users").
    @Published private(set) var userRole: UserRole?
    @Published private(set) var isAdmin: Bool = false
    @Published private(set) var resident: Resident?
    @Published private(set) var admin: Admin?

    // Nuevo: usuario unificado desde la colección "users".
    @Published var currentUser: AppUser?
    @Published var currentBuilding: Building? // Para verificar tipo (Condo vs Multifamily)

    private let authService: AuthServicing
    private var authListenerHandle: AuthStateDidChangeListenerHandle?

    // Firestore listeners
    private var residentCancellable: AnyCancellable?
    private var adminCancellable: AnyCancellable?

    // Init
    init(authService: AuthServicing) {
        self.authService = authService
        seedInitialState()
        observeAuthChanges()
    }

    convenience init() {
        self.init(authService: AuthService.shared)
    }

    deinit {
        if let handle = authListenerHandle {
            Auth.auth().removeStateDidChangeListener(handle)
        }
        cancelProfileListeners()
    }

    private func seedInitialState() {
        isAuthenticated = authService.isAuthenticated
        isCheckingAuth = true
    }

    private func observeAuthChanges() {
        if let handle = authListenerHandle {
            Auth.auth().removeStateDidChangeListener(handle)
        }
        authListenerHandle = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            guard let self else { return }
            Task { @MainActor in
                #if DEBUG
                print("🧭 [SessionManager] Auth state changed: user=\(user?.uid ?? "nil")")
                #endif
                self.isAuthenticated = (user != nil)
                if let user = user {
                    #if DEBUG
                    print("🧭 [SessionManager] Attempting to load user document from users/\(user.uid)...")
                    #endif
                    do {
                        // PRIORIDAD 1: Buscar por UID (fuente de verdad)
                        if let appUser = try await FirestoreService.shared.getUser(id: user.uid) {
                            #if DEBUG
                            print("🧭 [SessionManager] ✅ User document found:")
                            print("   uid: \(user.uid)")
                            print("   role: \(appUser.role.rawValue)")
                            print("   buildingId: \(appUser.buildingId ?? "nil")")
                            print("   unitId: \(appUser.unitId ?? "nil")")
                            print("   accessStatus: \(appUser.accessStatus.rawValue)")
                            #endif
                            
                            self.currentUser = appUser
                            self.setRole(appUser.role)
                            if let bid = appUser.buildingId {
                                self.currentBuilding = try? await FirestoreService.shared.getBuilding(id: bid)
                                #if DEBUG
                                print("🧭 [SessionManager]    building: \(self.currentBuilding?.name ?? "error")")
                                #endif
                            } else {
                                self.currentBuilding = nil
                                #if DEBUG
                                print("🧭 [SessionManager]    ⚠️ no buildingId - onboarding state")
                                #endif
                            }
                        }
                        // FALLBACK: Migración automática desde email
                        else if let email = user.email,
                                let appUserByEmail = try await FirestoreService.shared.fetchUser(byEmail: email.lowercased()) {
                            #if DEBUG
                            print("🧭 [SessionManager] ⚠️ User not found by UID, migrating from email: \(email)")
                            #endif
                            try await FirestoreService.shared.createUser(id: user.uid, user: appUserByEmail)
                            self.currentUser = appUserByEmail
                            self.setRole(appUserByEmail.role)
                            if let bid = appUserByEmail.buildingId {
                                self.currentBuilding = try? await FirestoreService.shared.getBuilding(id: bid)
                            }
                        }
                        // LEGACY FINAL: Intentar cargar desde admins/residents
                        else {
                            #if DEBUG
                            print("🧭 [SessionManager] ❌ User document NOT FOUND in users/\(user.uid)")
                            print("    Trying legacy collections...")
                            #endif
                            await self.loadRoleAndObserveProfile(uid: user.uid)
                            self.currentUser = nil
                            self.currentBuilding = nil
                        }
                    } catch {
                        #if DEBUG
                        print("🧭 [SessionManager] ❌ Error loading user: \(error.localizedDescription)")
                        #endif
                        await self.loadRoleAndObserveProfile(uid: user.uid)
                        self.currentUser = nil
                        self.currentBuilding = nil
                    }
                } else {
                    #if DEBUG
                    print("🧭 [SessionManager] User signed out")
                    #endif
                    self.userRole = nil
                    self.isAdmin = false
                    self.resident = nil
                    self.admin = nil
                    self.currentUser = nil
                    self.currentBuilding = nil
                    self.cancelProfileListeners()
                }
                #if DEBUG
                print("🧭 [SessionManager] isCheckingAuth = false, currentUser = \(self.currentUser?.uid ?? "nil")")
                #endif
                self.isCheckingAuth = false
            }
        }
    }

    // Solo cancela suscripciones y limpia referencias.
    nonisolated private func cancelProfileListeners() {
        Task { @MainActor in
            residentCancellable?.cancel()
            adminCancellable?.cancel()
            residentCancellable = nil
            adminCancellable = nil
        }
    }

    private func setRole(_ role: UserRole?) {
        userRole = role
        isAdmin = (role == .admin)
    }

    private func observeResident(uid: String) {
        residentCancellable = FirestoreService.shared.listenResident(uid: uid)
            .receive(on: RunLoop.main)
            .sink { [weak self] profile in
                self?.resident = profile
                if profile != nil {
                    self?.setRole(.resident)
                }
            }
    }

    private func observeAdmin(uid: String) {
        adminCancellable = FirestoreService.shared.listenAdmin(uid: uid)
            .receive(on: RunLoop.main)
            .sink { [weak self] profile in
                self?.admin = profile
                if profile != nil {
                    self?.setRole(.admin)
                }
            }
    }

    /// Detecta rol revisando presencia en 'admins' y luego en 'residents'.
    private func detectRole(uid: String) async -> UserRole? {
        if let _ = try? await FirestoreService.shared.getAdmin(uid: uid) {
            return .admin
        }
        if let _ = try? await FirestoreService.shared.getResident(uid: uid) {
            return .resident
        }
        return nil
    }

    private func loadRoleAndObserveProfile(uid: String) async {
        cancelProfileListeners()
        let role = await detectRole(uid: uid)
        setRole(role)
        if role == .admin {
            observeAdmin(uid: uid)
        } else if role == .resident {
            observeResident(uid: uid)
        } else {
            resident = nil
            admin = nil
        }
    }

    /// Refresca el estado de sesión leyendo de Firebase/AuthService y recuperando el perfil en Firestore.
    func refreshSession() async {
        isCheckingAuth = true
        let authUser = Auth.auth().currentUser
        isAuthenticated = (authUser != nil)

        guard let user = authUser else {
            userRole = nil
            isAdmin = false
            resident = nil
            admin = nil
            currentUser = nil
            currentBuilding = nil
            cancelProfileListeners()
            isCheckingAuth = false
            return
        }

        do {
            // PRIORIDAD 1: users/{uid}
            if let appUser = try await FirestoreService.shared.getUser(id: user.uid) {
                currentUser = appUser
                setRole(appUser.role)
                if let bid = appUser.buildingId {
                    currentBuilding = try? await FirestoreService.shared.getBuilding(id: bid)
                } else {
                    currentBuilding = nil
                }
            }
            // FALLBACK: Migración
            else if let email = user.email,
                    let appUserByEmail = try await FirestoreService.shared.fetchUser(byEmail: email.lowercased()) {
                print("📦 Migrating user in refreshSession: \(user.uid)")
                try await FirestoreService.shared.createUser(id: user.uid, user: appUserByEmail)
                currentUser = appUserByEmail
                setRole(appUserByEmail.role)
                if let bid = appUserByEmail.buildingId {
                    currentBuilding = try? await FirestoreService.shared.getBuilding(id: bid)
                }
            }
            // LEGACY
            else {
                print("⚠️ refreshSession: User doc not found, trying legacy")
                await loadRoleAndObserveProfile(uid: user.uid)
                currentUser = nil
                currentBuilding = nil
            }
        } catch {
            print("❌ refreshSession error: \(error.localizedDescription)")
            await loadRoleAndObserveProfile(uid: user.uid)
            currentUser = nil
            currentBuilding = nil
        }
        isCheckingAuth = false
    }

    // MARK: - Auth actions

    func login(email: String, password: String) async -> Result<Void, Error> {
        let result = await authService.loginUser(email: email, password: password)
        if case .success = result {
            await refreshSession()
        }
        return result
    }

    func register(
        email: String, 
        password: String, 
        fullName: String = "Usuario", 
        role: UserRole = .resident
    ) async -> Result<Void, Error> {
        let result = await authService.registerUser(email: email, password: password)
        
        if case .success = result {
            // Crear documento en users/{uid} INMEDIATAMENTE
            if let uid = authService.currentUserUID {
                let newUser = AppUser(
                    id: uid,
                    uid: uid,
                    fullName: fullName,
                    email: email,
                    emailLowercased: email.lowercased().trimmingCharacters(in: .whitespaces),
                    role: role,
                    buildingId: nil,
                    unitId: nil,
                    photoURL: nil,
                    isActive: false,
                    accessStatus: .onboarding,
                    createdAt: Date(),
                    updatedAt: Date()
                )
                
                do {
                    try await FirestoreService.shared.createUser(id: uid, user: newUser)
                    print("✅ User document created: users/\(uid)")
                } catch {
                    print("❌ Failed to create user doc: \(error.localizedDescription)")
                    // NO falla el registro, el auth listener lo intentará
                }
            }
            
            await refreshSession()
        }
        
        return result
    }

    func resetPassword(email: String) async -> Result<Void, Error> {
        await authService.sendPasswordReset(email: email)
    }

    func signOut() async -> Result<Void, Error> {
        let result = authService.signOut()
        if case .success = result {
            isAuthenticated = false
            userRole = nil
            isAdmin = false
            resident = nil
            admin = nil
            currentUser = nil
            currentBuilding = nil
            cancelProfileListeners()
        }
        return result
    }
}
