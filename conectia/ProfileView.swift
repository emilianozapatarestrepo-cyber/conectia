import SwiftUI
import PhotosUI

struct ProfileView: View {
    @EnvironmentObject private var session: SessionManager
    @State private var selectedItem: PhotosPickerItem?
    @State private var selectedImage: UIImage?
    @State private var isUploading = false
    @State private var alertMessage: String?

    var body: some View {
        Form {
            Section {
                HStack {
                    ZStack {
                        if let img = selectedImage {
                            Image(uiImage: img)
                                .resizable()
                                .scaledToFill()
                                .frame(width: 64, height: 64)
                                .clipShape(Circle())
                        } else if let urlStr = profileImageURL,
                                  let url = URL(string: urlStr) {
                            AsyncImage(url: url) { image in
                                image.resizable().scaledToFill()
                            } placeholder: { Color.gray.opacity(0.2) }
                                .frame(width: 64, height: 64)
                                .clipShape(Circle())
                        } else {
                            Image(systemName: "person.crop.circle.fill")
                                .resizable().scaledToFit()
                                .frame(width: 64, height: 64)
                                .foregroundColor(.purple.opacity(0.7))
                        }
                        if isUploading { ProgressView().scaleEffect(1.2) }
                    }
                    VStack(alignment: .leading) {
                        Text(userName)
                            .font(.headline)
                        Text(userEmail)
                            .foregroundColor(.secondary)
                            .font(.subheadline)
                    }
                    Spacer()
                    PhotosPicker(selection: $selectedItem, matching: .images) {
                        Image(systemName: "camera.fill")
                            .foregroundColor(.purple)
                    }
                    .disabled(isUploading)
                }
            }

            Section("Información") {
                if let b = buildingId { Label("Edificio: \(b)", systemImage: "building.2") }
                // Unit display requires fetching, simplified for now
                if userIsActive {
                    Label("Cuenta activa", systemImage: "checkmark.seal").foregroundColor(.green)
                }
            }

            Section {
                Button("Cambiar contraseña") {
                    Task { await sendPasswordReset() }
                }
                .foregroundColor(.purple)

                Button("Cerrar sesión", role: .destructive) {
                    Task { _ = await session.signOut() }
                }
            }
        }
        .navigationTitle("Perfil")
        .onChange(of: selectedItem) { _, newValue in
            Task { await uploadNewPhoto(item: newValue) }
        }
        .alert("Mensaje", isPresented: .constant(alertMessage != nil), actions: {
            Button("OK") { alertMessage = nil }
        }, message: {
            Text(alertMessage ?? "")
        })
    }
    
    // Helpers computados para soportar currentUser o legacy
    
    var userName: String {
        return session.currentUser?.fullName ?? session.resident?.fullName ?? session.admin?.fullName ?? "Usuario"
    }
    
    var userEmail: String {
        return session.currentUser?.email ?? session.resident?.email ?? session.admin?.email ?? ""
    }
    
    var profileImageURL: String? {
        return session.currentUser?.photoURL ?? session.resident?.photoURL ?? session.admin?.photoURL
    }
    
    var buildingId: String? {
        return session.currentUser?.buildingId ?? session.resident?.buildingId
    }
    
    var userIsActive: Bool {
        return session.currentUser?.isActive ?? session.resident?.isActive ?? session.admin?.isActive ?? false
    }

    private func uploadNewPhoto(item: PhotosPickerItem?) async {
        guard let item else { return }
        do {
            guard let data = try await item.loadTransferable(type: Data.self),
                  let image = UIImage(data: data),
                  let uid = AuthService.shared.currentUserUID else { return }
            selectedImage = image
            isUploading = true
            let url = try await StorageService.shared.uploadUIImage(image, path: "profiles/\(uid).jpg", quality: 0.8)
            
            // Update Firestore
            if var user = session.currentUser {
                user.photoURL = url.absoluteString
                // updateAppUser
                 try await FirestoreService.shared.updateUser(id: user.id ?? uid, user: user)
                 // Manually update session for immediate feeling (though listener should handle it if implemented)
                 session.currentUser?.photoURL = url.absoluteString
            } else if var res = session.resident, let id = res.id {
                res.photoURL = url.absoluteString
                try await FirestoreService.shared.createResident(uid: id, resident: res)
            } else if var adm = session.admin, let id = adm.id {
                adm.photoURL = url.absoluteString
                try await FirestoreService.shared.createAdmin(uid: id, admin: adm)
            }
            alertMessage = "Foto actualizada correctamente."
        } catch {
            alertMessage = error.localizedDescription
        }
        isUploading = false
    }

    private func sendPasswordReset() async {
        guard !userEmail.isEmpty else { return }
        let result = await AuthService.shared.sendPasswordReset(email: userEmail)
        switch result {
        case .success:
            alertMessage = "Te enviamos un correo para cambiar tu contraseña."
        case .failure(let error):
            alertMessage = error.localizedDescription
        }
    }
}

