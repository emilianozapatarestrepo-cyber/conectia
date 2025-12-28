import SwiftUI
import Combine

struct ResidentHomeView: View {
    @EnvironmentObject private var session: SessionManager
    @State private var payments: [Payment] = []
    @State private var notifications: [AppNotification] = []
    @State private var cancellables = Set<AnyCancellable>()

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                header
                quickActions
                if let pending = nextPendingPayment {
                    paymentCard(for: pending)
                }
                notificationsSection
            }
            .padding()
        }
        .navigationTitle("Conectia")
        .onAppear(perform: subscribe)
    }

    private var header: some View {
        HStack {
            VStack(alignment: .leading) {
                Text("Hola,")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                // Preferimos currentUser si está disponible; fallback a perfiles legacy.
                Text(session.currentUser?.fullName ?? session.resident?.fullName ?? session.admin?.fullName ?? "Usuario")
                    .font(.title)
                    .fontWeight(.bold)
            }
            Spacer()
            Image(systemName: "building.2.crop.circle")
                .font(.system(size: 40))
                .foregroundColor(.purple)
        }
    }

    private var quickActions: some View {
        HStack(spacing: 12) {
            NavigationLink {
                PaymentsListView()
            } label: {
                quickAction(title: "Pagos", icon: "creditcard")
            }
            NavigationLink {
                TicketListView()
            } label: {
                quickAction(title: "Tickets", icon: "tray.full")
            }
            NavigationLink {
                ProfileView()
            } label: {
                quickAction(title: "Perfil", icon: "person.crop.circle")
            }
            if let buildingId = session.currentUser?.buildingId {
                NavigationLink {
                    AmenitiesListView(buildingId: buildingId)
                } label: {
                    quickAction(title: "Amenities", icon: "sportscourt")
                }
            }
        }
    }

    private func quickAction(title: String, icon: String) -> some View {
        VStack(spacing: 8) {
            Image(systemName: icon)
                .font(.title2)
            Text(title)
                .font(.footnote)
        }
        .frame(maxWidth: .infinity)
        .padding()
        .background(.ultraThinMaterial)
        .cornerRadius(14)
        .foregroundColor(.purple)
    }

    private func paymentCard(for payment: Payment) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Factura pendiente")
                .font(.subheadline)
                .foregroundColor(.secondary)
            Text(payment.description)
                .font(.headline)
            Text("$ \(Int(payment.amount)) \(payment.currency)")
                .font(.title2)
                .fontWeight(.bold)
                .foregroundColor(.purple)
            NavigationLink("Pagar ahora") {
                PaymentDetailView(payment: payment)
            }
            .buttonStyle(.borderedProminent)
            .tint(.purple)
        }
        .padding()
        .background(.ultraThinMaterial)
        .cornerRadius(16)
    }

    private var notificationsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Novedades")
                    .font(.headline)
                Spacer()
            }
            ForEach(notifications.prefix(3)) { item in
                VStack(alignment: .leading, spacing: 4) {
                    Text(item.title).fontWeight(.semibold)
                    Text(item.message).font(.subheadline).foregroundColor(.secondary)
                }
                .padding()
                .background(Color(.secondarySystemBackground))
                .cornerRadius(12)
            }
            
            if notifications.count > 3 {
                NavigationLink("Ver todas") {
                    NotificationsListView()
                }
                .font(.footnote)
            }
            if notifications.isEmpty {
                Text("No hay novedades por ahora.")
                    .foregroundColor(.secondary)
                    .padding(.vertical, 8)
            }
        }
    }

    private var nextPendingPayment: Payment? {
        payments.first(where: { $0.status == .pending || $0.status == .overdue })
    }

    private func subscribe() {
        guard let uid = AuthService.shared.currentUserUID else { return }
        FirestoreService.shared.listenPaymentsForUser(uid)
            .receive(on: RunLoop.main)
            .sink(receiveCompletion: { _ in }, receiveValue: { self.payments = $0 })
            .store(in: &cancellables)

        FirestoreService.shared.listenNotifications(audience: "residents")
            .receive(on: RunLoop.main)
            .sink(receiveCompletion: { _ in }, receiveValue: { self.notifications = $0 })
            .store(in: &cancellables)
    }
}
