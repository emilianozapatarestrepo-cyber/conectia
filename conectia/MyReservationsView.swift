import SwiftUI
import Combine

struct MyReservationsView: View {
    @EnvironmentObject private var session: SessionManager
    @State private var reservations: [Reservation] = []
    // Necesitamos los amenities para mostrar el nombre, no solo el ID
    @State private var amenitiesDict: [String: Amenity] = [:]
    
    @State private var isLoading = true
    @State private var cancellables = Set<AnyCancellable>()
    
    var body: some View {
        List {
            if isLoading {
                ProgressView()
            } else if reservations.isEmpty {
                Text("No tienes reservas.")
                    .foregroundColor(.secondary)
            } else {
                ForEach(reservations) { res in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(amenityName(for: res.amenityId))
                                .font(.headline)
                            Spacer()
                            statusBadge(res.status)
                        }
                        
                        HStack {
                            Label(res.date.formatted(date: .abbreviated, time: .omitted), systemImage: "calendar")
                            Spacer()
                            Label(res.hour, systemImage: "clock")
                        }
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        
                        if res.status == .pending {
                            Button("Cancelar Solicitud") {
                                cancelReservation(res)
                            }
                            .font(.caption)
                            .foregroundColor(.red)
                            .padding(.top, 4)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        }
        .navigationTitle("Mis Reservas")
        .onAppear {
            loadData()
        }
    }
    
    // UI Helpers
    
    private func statusBadge(_ status: ReservationStatus) -> some View {
        Text(statusText(status))
            .font(.caption)
            .fontWeight(.bold)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(statusColor(status).opacity(0.2))
            .foregroundColor(statusColor(status))
            .cornerRadius(8)
    }
    
    private func statusText(_ status: ReservationStatus) -> String {
        switch status {
        case .pending: return "Pendiente"
        case .confirmed: return "Confirmada"
        case .cancelled: return "Cancelada"
        }
    }
    
    private func statusColor(_ status: ReservationStatus) -> Color {
        switch status {
        case .pending: return .orange
        case .confirmed: return .green
        case .cancelled: return .red
        }
    }
    
    private func amenityName(for id: String) -> String {
        return amenitiesDict[id]?.name ?? "Amenity"
    }
    
    // Logic
    
    private func loadData() {
        guard let uid = session.currentUser?.uid else { return }
        isLoading = true
        
        Task {
            do {
                // 1. Obtener buildings/units para saber mi UnitId
                // TODO: Optimizar esto en un AppState o similar.
                var myUnitId: String? = nil
                if let buildingId = session.currentUser?.buildingId {
                     let units = try await FirestoreService.shared.fetchUnits(for: buildingId)
                     myUnitId = units.first(where: { $0.residentId == uid })?.id
                     
                     // Cargar amenities también para tener nombres
                     let ams = try await FirestoreService.shared.fetchAmenities(for: buildingId)
                     self.amenitiesDict = Dictionary(uniqueKeysWithValues: ams.map { ($0.id ?? "", $0) })
                }
                
                guard let unitId = myUnitId else {
                    isLoading = false
                    return
                }
                
                // 2. Escuchar reservas de mi unidad
                FirestoreService.shared.listenReservations(unitId: unitId)
                    .receive(on: RunLoop.main)
                    .sink(receiveCompletion: { _ in }, receiveValue: { items in
                        self.reservations = items
                        self.isLoading = false
                    })
                    .store(in: &cancellables)
                
            } catch {
                print("Error loading my reservations: \(error)")
                isLoading = false
            }
        }
    }
    
    private func cancelReservation(_ res: Reservation) {
        guard let id = res.id else { return }
        var updated = res
        updated.status = .cancelled
        
        Task {
            try? await FirestoreService.shared.updateReservation(id: id, reservation: updated)
        }
    }
}
