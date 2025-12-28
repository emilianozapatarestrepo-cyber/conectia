import SwiftUI
import PhotosUI

struct NewTicketView: View {
    typealias SubmitAction = (_ title: String, _ message: String, _ priority: TicketPriority, _ images: [UIImage], _ permission: Bool?, _ window: String?) async -> Result<Void, Error>

    @Environment(\.dismiss) private var dismiss

    @State private var titleText: String = ""
    @State private var messageText: String = ""
    @State private var priority: TicketPriority = .medium
    @State private var selectedItems: [PhotosPickerItem] = []
    @State private var selectedImages: [UIImage] = []
    
    // SaaS / Multifamily Fields
    @State private var permissionToEnter: Bool = false
    @State private var entryWindow: String = "Cualquier horario"
    let entryWindows = ["Cualquier horario", "Mañana (8-12)", "Tarde (13-17)", "Noche (18-20)"]

    @State private var isSubmitting: Bool = false
    @State private var alertMessage: String?
    let onSubmit: SubmitAction
    
    // To detect Building Type, we will inject or check a flag. For now we just show it.
    // Ideally we check `session.building.type`. Assuming this is passed or we assume hybrid awareness.

    var body: some View {
        Form {
            Section(header: Text("Detalles")) {
                TextField("Título", text: $titleText)
                TextField("Descripción", text: $messageText, axis: .vertical)
                    .lineLimit(3...6)
                Picker("Prioridad", selection: $priority) {
                    ForEach(TicketPriority.allCases, id: \.self) { p in
                        Text(label(for: p)).tag(p)
                    }
                }
            }
            
            Section(header: Text("Acceso a Unidad")) {
                Toggle("Permiso de entrada (PTE)", isOn: $permissionToEnter)
                if permissionToEnter {
                    Picker("Horario preferido", selection: $entryWindow) {
                        ForEach(entryWindows, id: \.self) { w in
                            Text(w).tag(w)
                        }
                    }
                }
                Text(permissionToEnter ? "El técnico podrá entrar con su llave maestra si no estás." : "El técnico debe coordinar contigo para entrar.")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            
            Section(header: Text("Adjuntos")) {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(Array(selectedImages.enumerated()), id: \.offset) { _, img in
                            Image(uiImage: img)
                                .resizable()
                                .scaledToFill()
                                .frame(width: 80, height: 80)
                                .clipped()
                                .cornerRadius(8)
                        }
                        PhotosPicker(selection: $selectedItems, maxSelectionCount: 5, matching: .images) {
                            Label("Agregar fotos", systemImage: "photo.on.rectangle")
                        }
                    }
                }
            }
            Section {
                Button {
                    Task { await submit() }
                } label: {
                    if isSubmitting { ProgressView() }
                    Text("Crear ticket")
                }
                .disabled(isSubmitting || titleText.trimmingCharacters(in: .whitespaces).isEmpty || messageText.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .navigationTitle("Nuevo ticket")
        .onChange(of: selectedItems) { _, items in
            Task { await loadImages(items) }
        }
        .alert("Mensaje", isPresented: .constant(alertMessage != nil), actions: {
            Button("OK") { alertMessage = nil }
        }, message: {
            Text(alertMessage ?? "")
        })
    }

    private func label(for p: TicketPriority) -> String {
        switch p {
        case .low: return "Baja"
        case .medium: return "Media"
        case .high: return "Alta"
        }
    }

    private func submit() async {
        isSubmitting = true
        let result = await onSubmit(titleText.trimmingCharacters(in: .whitespaces),
                                    messageText.trimmingCharacters(in: .whitespaces),
                                    priority,
                                    selectedImages,
                                    permissionToEnter,
                                    permissionToEnter ? entryWindow : nil)
        isSubmitting = false
        switch result {
        case .success:
            dismiss()
        case .failure(let error):
            alertMessage = error.localizedDescription
        }
    }

    private func loadImages(_ items: [PhotosPickerItem]) async {
        selectedImages.removeAll()
        for item in items {
            if let data = try? await item.loadTransferable(type: Data.self),
               let img = UIImage(data: data) {
                selectedImages.append(img)
            }
        }
    }
}

