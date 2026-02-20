import SwiftUI

struct OnboardingView: View {
    @EnvironmentObject private var session: SessionManager

    // Data
    @State private var buildings: [Building] = []
    @State private var units: [OnboardingUnit] = []

    // Selection
    @State private var selectedBuilding: Building?
    @State private var selectedUnit: OnboardingUnit?
    @State private var occupancyRole: OccupantType = .tenant

    // UI State
    @State private var isLoading = false
    @State private var isSubmitting = false
    @State private var errorMessage = ""
    @State private var searchText = ""

    private var filteredBuildings: [Building] {
        if searchText.isEmpty { return buildings }
        return buildings.filter { $0.name.localizedCaseInsensitiveContains(searchText) }
    }

    var body: some View {
        NavigationStack {
            Group {
                if isLoading && buildings.isEmpty {
                    ProgressView("Cargando condominios...")
                } else if selectedBuilding == nil {
                    buildingSelectionView
                } else if selectedUnit == nil {
                    unitSelectionView
                } else {
                    confirmationView
                }
            }
            .navigationTitle("Solicitar acceso")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    if selectedBuilding != nil {
                        Button("Atrás") { goBack() }
                    }
                }
                ToolbarItem(placement: .destructiveAction) {
                    Button("Salir") { Task { _ = await session.signOut() } }
                        .foregroundColor(.red)
                }
            }
            .alert("Error", isPresented: .init(get: { !errorMessage.isEmpty }, set: { if !$0 { errorMessage = "" } })) {
                Button("OK") { errorMessage = "" }
            } message: { Text(errorMessage) }
        }
        .task { await loadBuildings() }
    }

    // MARK: - Step Views

    private var buildingSelectionView: some View {
        List {
            Section { TextField("Buscar condominio", text: $searchText) }
            Section("Selecciona tu condominio") {
                if filteredBuildings.isEmpty && !isLoading {
                    Text("No se encontraron condominios").foregroundColor(.secondary)
                } else {
                    ForEach(filteredBuildings) { building in
                        Button { selectBuilding(building) } label: {
                            HStack {
                                VStack(alignment: .leading) {
                                    Text(building.name).foregroundColor(.primary)
                                    if let addr = building.address {
                                        Text(addr).font(.caption).foregroundColor(.secondary)
                                    }
                                }
                                Spacer()
                                Image(systemName: "chevron.right").foregroundColor(.secondary)
                            }
                        }
                    }
                }
            }
        }
    }

    private var unitSelectionView: some View {
        List {
            Section("Selecciona tu unidad en \(selectedBuilding?.name ?? "")") {
                if isLoading {
                    ProgressView()
                } else if units.isEmpty {
                    Text("No hay unidades disponibles").foregroundColor(.secondary)
                } else {
                    ForEach(units) { unit in
                        Button { selectedUnit = unit } label: {
                            HStack {
                                Text(unit.label).foregroundColor(.primary)
                                Spacer()
                                if selectedUnit?.id == unit.id {
                                    Image(systemName: "checkmark").foregroundColor(.indigo)
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    private var confirmationView: some View {
        Form {
            Section("Resumen de solicitud") {
                LabeledContent("Condominio", value: selectedBuilding?.name ?? "")
                LabeledContent("Unidad", value: selectedUnit?.label ?? "")
            }
            Section("Tipo de ocupante") {
                Picker("Soy", selection: $occupancyRole) {
                    Text("Propietario").tag(OccupantType.owner)
                    Text("Inquilino").tag(OccupantType.tenant)
                }
                .pickerStyle(.segmented)
            }
            Section {
                Button { submitRequest() } label: {
                    if isSubmitting {
                        ProgressView().frame(maxWidth: .infinity)
                    } else {
                        Text("Enviar solicitud").frame(maxWidth: .infinity)
                    }
                }
                .disabled(isSubmitting)
            }
        }
    }

    // MARK: - Actions

    private func loadBuildings() async {
        isLoading = true
        do {
            buildings = try await FirestoreService.shared.listBuildings()
        } catch {
            errorMessage = "No se pudieron cargar los condominios"
            print("❌ loadBuildings error: \(error)")
        }
        isLoading = false
    }

    private func selectBuilding(_ building: Building) {
        selectedBuilding = building
        selectedUnit = nil
        Task { await loadUnits(buildingId: building.id!) }
    }

    private func loadUnits(buildingId: String) async {
        isLoading = true
        do {
            units = try await FirestoreService.shared.listUnits(buildingId: buildingId)
        } catch {
            errorMessage = "No se pudieron cargar las unidades"
            print("❌ loadUnits error: \(error)")
        }
        isLoading = false
    }

    private func goBack() {
        if selectedUnit != nil {
            selectedUnit = nil
        } else {
            selectedBuilding = nil
            units = []
        }
    }

    private func submitRequest() {
        guard let user = session.currentUser,
              let building = selectedBuilding,
              let unit = selectedUnit,
              let buildingId = building.id,
              let unitId = unit.id else { return }

        Task {
            isSubmitting = true
            do {
                // Crear accessRequest en colección raíz
                let request = AccessRequest(
                    requesterUid: user.uid,
                    requestedUnitId: unitId,
                    requestedBuildingId: buildingId,
                    requestedOccupancyRole: occupancyRole
                )
                _ = try await FirestoreService.shared.createAccessRequest(request)

                // Actualizar usuario a pendingApproval
                try await FirestoreService.shared.updateUserPendingApproval(
                    uid: user.uid,
                    buildingId: buildingId,
                    unitId: unitId,
                    occupancyRole: occupancyRole
                )

                // Refrescar sesión para navegar a AccessPendingView
                await session.refreshSession()
                print("✅ Access request submitted for \(building.name) - \(unit.label)")
            } catch {
                errorMessage = "Error al enviar solicitud: \(error.localizedDescription)"
                print("❌ submitRequest error: \(error)")
            }
            isSubmitting = false
        }
    }
}
