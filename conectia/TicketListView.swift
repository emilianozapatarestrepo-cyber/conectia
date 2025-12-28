import SwiftUI

struct TicketListView: View {
    @EnvironmentObject private var session: SessionManager
    @StateObject private var vm = TicketsViewModel()
    @State private var showingNew = false

    var body: some View {
        List {
            ForEach(vm.tickets) { ticket in
                NavigationLink {
                    TicketDetailView(ticket: ticket)
                } label: {
                    HStack {
                        VStack(alignment: .leading) {
                            Text(ticket.title).font(.headline)
                            Text(ticket.message).lineLimit(2).foregroundColor(.secondary)
                        }
                        Spacer()
                        statusBadge(ticket.status)
                    }
                }
            }
        }
        .overlay {
            if vm.tickets.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "tray")
                        .font(.largeTitle)
                        .foregroundColor(.secondary)
                    Text("No hay tickets")
                        .font(.headline)
                        .foregroundColor(.secondary)
                    Text("Crea un nuevo ticket para reportar una solicitud o queja.")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
            }
        }
        .navigationTitle("Tickets")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showingNew = true
                } label: {
                    Image(systemName: "plus.circle.fill").foregroundColor(.purple)
                }
            }
        }
        .onAppear {
            let isAdmin = (session.currentUser?.role == .admin) || (session.userRole == .admin)
            let uid = AuthService.shared.currentUserUID ?? ""
            vm.startListening(userId: uid, isAdmin: isAdmin)
        }
        .sheet(isPresented: $showingNew) {
            NavigationStack {
                NewTicketView { title, message, priority, images, permission, window in
                    await vm.createTicket(title: title, message: message, priority: priority, images: images, permission: permission, window: window)
                }
            }
        }
    }

    private func statusBadge(_ status: TicketStatus) -> some View {
        let text: String
        let color: Color
        switch status {
        case .open: text = "Abierto"; color = .orange
        case .inReview: text = "En revisión"; color = .blue
        case .resolved: text = "Resuelto"; color = .green
        }
        return Text(text)
            .font(.caption)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(color.opacity(0.15))
            .foregroundColor(color)
            .cornerRadius(8)
    }
}
