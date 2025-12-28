import SwiftUI
import Combine
import PhotosUI

struct NetworkingView: View {
    @EnvironmentObject private var session: SessionManager
    @State private var profiles: [NetworkingProfile] = []
    @State private var myProfile: NetworkingProfile?
    @State private var showingCreateSheet = false
    @State private var cancellables = Set<AnyCancellable>()
    
    var body: some View {
        NavigationStack {
            List {
                if let mine = myProfile {
                    Section("Mi Perfil Profesional") {
                        NetworkingRow(profile: mine)
                    }
                } else {
                    Section {
                        Button {
                            showingCreateSheet = true
                        } label: {
                            HStack {
                                Image(systemName: "person.crop.circle.badge.plus")
                                    .font(.title2)
                                    .foregroundColor(.purple)
                                VStack(alignment: .leading) {
                                    Text("Crear Perfil Profesional")
                                        .font(.headline)
                                    Text("Únete al directorio de talento de tu edificio.")
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                            }
                        }
                    }
                }
                
                Section("Directorio de Vecinos") {
                    if profiles.isEmpty {
                        Text("Aún no hay profesionales registrados en tu edificio.")
                            .foregroundColor(.secondary)
                            .padding()
                    } else {
                        ForEach(profiles.filter { $0.id != myProfile?.id }) { profile in
                            NetworkingRow(profile: profile)
                        }
                    }
                }
            }
            .navigationTitle("Networking")
            .onAppear {
                loadData()
            }
            .sheet(isPresented: $showingCreateSheet) {
                NetworkingProfileForm(onSaved: {
                    loadData()
                    showingCreateSheet = false
                })
            }
        }
    }
    
    private func loadData() {
        guard let buildingId = session.currentUser?.buildingId else { return }
        guard let uid = session.currentUser?.uid else { return }
        
        // Cargar directorio
        FirestoreService.shared.listenNetworking(buildingId: buildingId)
            .receive(on: RunLoop.main)
            .sink(receiveCompletion: { _ in }, receiveValue: { allProfiles in
                self.profiles = allProfiles
                self.myProfile = allProfiles.first(where: { $0.userId == uid })
            })
            .store(in: &cancellables)
    }
}

struct NetworkingRow: View {
    let profile: NetworkingProfile
    
    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            // Avatar
            if let urlStr = profile.avatarURL, let url = URL(string: urlStr) {
                AsyncImage(url: url) { image in
                    image.resizable().scaledToFill()
                } placeholder: { Color.gray.opacity(0.3) }
                .frame(width: 50, height: 50)
                .clipShape(Circle())
            } else {
                Image(systemName: "person.circle.fill")
                    .resizable()
                    .frame(width: 50, height: 50)
                    .foregroundColor(.gray)
            }
            
            VStack(alignment: .leading, spacing: 4) {
                Text(profile.fullName)
                    .font(.headline)
                Text(profile.profession)
                    .font(.subheadline)
                    .foregroundColor(.purple)
                    .fontWeight(.medium)
                Text(profile.bio)
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .lineLimit(3)
                
                HStack {
                    if let _ = profile.linkedIn {
                        Image(systemName: "link") // LinkedIn icon placeholder
                            .foregroundColor(.blue)
                    }
                    if let _ = profile.contactEmail {
                        Image(systemName: "envelope.fill")
                            .foregroundColor(.gray)
                    }
                }
                .font(.caption)
                .padding(.top, 4)
            }
        }
        .padding(.vertical, 4)
    }
}

struct NetworkingProfileForm: View {
    typealias OnSaved = () -> Void
    @EnvironmentObject private var session: SessionManager
    @State private var profession = ""
    @State private var bio = ""
    @State private var linkedIn = ""
    @State private var contactEmail = ""
    @State private var isSaving = false
    var onSaved: OnSaved
    
    var body: some View {
        NavigationStack {
            Form {
                Section(header: Text("Tu Talento")) {
                    TextField("Profesión (Ej. Contador, Diseñador)", text: $profession)
                    TextField("Bio corta (Servicios que ofreces)", text: $bio, axis: .vertical)
                        .lineLimit(3...5)
                }
                
                Section(header: Text("Contacto")) {
                    TextField("Email de contacto", text: $contactEmail)
                        .keyboardType(.emailAddress)
                        .autocapitalization(.none)
                    TextField("Link a Portafolio / LinkedIn", text: $linkedIn)
                        .keyboardType(.URL)
                        .autocapitalization(.none)
                }
                
                Section {
                    Button {
                        save()
                    } label: {
                        if isSaving { ProgressView() }
                        Text("Publicar Perfil")
                    }
                    .disabled(profession.isEmpty || bio.isEmpty)
                }
            }
            .navigationTitle("Crear Perfil")
        }
    }
    
    private func save() {
        guard let user = session.currentUser, let buildingId = user.buildingId, let uid = user.id else { return }
        isSaving = true
        
        let newProfile = NetworkingProfile(
            userId: uid,
            buildingId: buildingId,
            fullName: user.fullName,
            avatarURL: user.photoURL,
            profession: profession,
            bio: bio,
            contactEmail: contactEmail.isEmpty ? nil : contactEmail,
            linkedIn: linkedIn.isEmpty ? nil : linkedIn
        )
        
        Task {
            try? await FirestoreService.shared.createNetworkingProfile(newProfile)
            isSaving = false
            onSaved()
        }
    }
}
