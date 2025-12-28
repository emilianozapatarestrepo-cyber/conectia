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
                self.isAuthenticated = (user != nil)
                if let user = user {
                    // Primero intentamos cargar el usuario unificado desde "users" por email.
                    do {
                        if let email = user.email,
                           let appUser = try await FirestoreService.shared.fetchUser(byEmail: email) {
                            self.currentUser = appUser
                            self.setRole(appUser.role) // Mantiene compatibilidad con vistas que usan isAdmin/userRole.
                            if let bid = appUser.buildingId {
                                self.currentBuilding = try? await FirestoreService.shared.getBuilding(id: bid)
                            }
                        } else {
                            // Fallback: lógica legacy de 'admins'/'residents' por UID, pero sin promocionar a currentUser (solo roles).
                            await self.loadRoleAndObserveProfile(uid: user.uid)
                            self.currentUser = nil
                            self.currentBuilding = nil
                        }
                    } catch {
                        // En caso de error, al menos aplicamos el fallback legacy.
                        await self.loadRoleAndObserveProfile(uid: user.uid)
                        self.currentUser = nil
                        self.currentBuilding = nil
                    }
                } else {
                    self.userRole = nil
                    self.isAdmin = false
                    self.resident = nil
                    self.admin = nil
                    self.currentUser = nil
                    self.cancelProfileListeners()
                }
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
    func refreshSession() {
        Task { @MainActor in
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
                if let email = user.email,
                   let appUser = try await FirestoreService.shared.fetchUser(byEmail: email) {
                    currentUser = appUser
                    setRole(appUser.role)
                    if let bid = appUser.buildingId {
                        currentBuilding = try? await FirestoreService.shared.getBuilding(id: bid)
                    } else {
                        currentBuilding = nil
                    }
                } else {
                    await loadRoleAndObserveProfile(uid: user.uid)
                    currentUser = nil
                    currentBuilding = nil
                }
            } catch {
                await loadRoleAndObserveProfile(uid: user.uid)
                currentUser = nil
                currentBuilding = nil
            }
            isCheckingAuth = false
        }
    }

    // MARK: - Auth actions

    func login(email: String, password: String) async -> Result<Void, Error> {
        let result = await authService.loginUser(email: email, password: password)
        if case .success = result {
            refreshSession()
        }
        return result
    }

    func register(email: String, password: String) async -> Result<Void, Error> {
        let result = await authService.registerUser(email: email, password: password)
        if case .success = result {
            refreshSession()
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
    
    // MARK: - Demo Mode
    
#if DEBUG
    func loginAsDemoUser() {
        // Bypass auth for demo
        isAuthenticated = true
        isCheckingAuth = false
        
        let demoId = "demo_user_maria"
        let buildingId = "demo_building_01"
        
        // Create Mock AppUser
        // Usamos init(id:data:) ya que el memberwise puede no estar disponible o ser confuso
        let data: [String: Any] = [
            "name": "Maria González",
            "email": "maria@demo.com",
            "role": UserRole.owner.rawValue,
            "buildingId": buildingId,
            "unitId": "unit_402", // Explicit unit for voting
            "isActive": true,
            "photoURL": "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80"
        ]
        
        if let mockUser = AppUser(id: demoId, data: data) {
            self.currentUser = mockUser
            self.setRole(.owner)
            // Mock Building
            let buildingData: [String: Any] = [
                "name": "Torres del Parque",
                "type": BuildingType.condo.rawValue
            ]
            self.currentBuilding = Building(id: buildingId, data: buildingData)
        }
    }
#endif
}
