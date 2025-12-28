import SwiftUI
import Combine

struct StaffHomeView: View {
    @EnvironmentObject private var session: SessionManager
    @State private var assignedTickets: [Ticket] = [] // Tickets assigned to me
    @State private var openTickets: [Ticket] = []     // Pool of open tickets
    @State private var cancellables = Set<AnyCancellable>()
    
    var body: some View {
        NavigationStack {
            List {
                Section("Mis Tareas (Asignadas)") {
                    if assignedTickets.isEmpty {
                        Text("No tienes tareas asignadas.")
                            .foregroundColor(.secondary)
                    } else {
                        ForEach(assignedTickets) { t in
                            NavigationLink {
                                TicketDetailView(ticket: t)
                            } label: {
                                TicketRow(ticket: t)
                            }
                        }
                    }
                }
                
                Section("Tickets Pendientes (Edificio)") {
                    if openTickets.isEmpty {
                        Text("No hay tickets pendientes.")
                            .foregroundColor(.secondary)
                    } else {
                        ForEach(openTickets) { t in
                            NavigationLink {
                                TicketDetailView(ticket: t)
                            } label: {
                                TicketRow(ticket: t)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Operaciones")
            .refreshable {
                loadData()
            }
            .onAppear {
                loadData()
            }
        }
    }
    
    private func loadData() {
        guard let uid = session.currentUser?.uid else { return }
        
        // 1. Mis tickets asignados
        FirestoreService.shared.listenTicketsFiltered(assignedAdminId: uid, orderBy: "priority", descending: true)
            .receive(on: RunLoop.main)
            .sink(receiveCompletion: { _ in }, receiveValue: { self.assignedTickets = $0 })
            .store(in: &cancellables)
            
        // 2. Tickets abiertos sin asignar (Pool)
        // Nota: Idealmente filtramos por buildingId también.
        FirestoreService.shared.listenTicketsFiltered(status: .open, orderBy: "createdAt", descending: true)
            .receive(on: RunLoop.main)
            .sink(receiveCompletion: { _ in }, receiveValue: { allOpen in
                // Filtramos en memoria los que no tienen assignee
                self.openTickets = allOpen.filter { $0.assignedAdminId == nil }
            })
            .store(in: &cancellables)
    }
}

struct TicketRow: View {
    let ticket: Ticket
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                if ticket.priority == .high {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundColor(.red)
                }
                Text(ticket.title)
                    .font(.headline)
            }
            Text(ticket.message)
                .font(.caption)
                .lineLimit(1)
                .foregroundColor(.secondary)
            
            if ticket.permissionToEnter == true {
                Label("Permiso de entrada: \(ticket.preferredEntryTime ?? "Si")", systemImage: "key.fill")
                    .font(.caption2)
                    .foregroundColor(.blue)
                    .padding(.top, 2)
            }
        }
    }
}
