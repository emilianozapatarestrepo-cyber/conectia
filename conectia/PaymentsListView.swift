import SwiftUI
import Combine

final class PaymentsViewModel: ObservableObject {
    @Published var payments: [Payment] = []
    @Published var errorMessage: String?
    private var cancellables = Set<AnyCancellable>()

    func start(uid: String, buildingId: String?) {
        cancellables.removeAll()
        FirestoreService.shared.listenPaymentsForUser(uid, buildingId: buildingId)
            .receive(on: RunLoop.main)
            .sink { [weak self] completion in
                if case .failure(let error) = completion {
                    self?.errorMessage = error.localizedDescription
                }
            } receiveValue: { [weak self] items in
                self?.payments = items
            }
            .store(in: &cancellables)
    }

    var outstandingBalance: Double {
        payments.filter { $0.status != .paid }.map { $0.amount }.reduce(0, +)
    }
}

struct PaymentsListView: View {
    @StateObject private var vm = PaymentsViewModel()
    @EnvironmentObject private var session: SessionManager

    var body: some View {
        List {
            Section {
                HStack {
                    VStack(alignment: .leading) {
                        Text("Saldo pendiente")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                        Text("$ \(Int(vm.outstandingBalance))")
                            .font(.title2)
                            .fontWeight(.bold)
                            .foregroundColor(.purple)
                    }
                    Spacer()
                }
                .padding(.vertical, 4)
            }

            Section("Historial") {
                ForEach(vm.payments) { payment in
                    NavigationLink {
                        PaymentDetailView(payment: payment)
                    } label: {
                        HStack {
                            VStack(alignment: .leading) {
                                Text(payment.description).font(.headline)
                                Text(payment.statusLabel).font(.caption).foregroundColor(.secondary)
                            }
                            Spacer()
                            Text("$ \(Int(payment.amount))")
                                .foregroundColor(.primary)
                        }
                    }
                }
            }
        }
        .navigationTitle("Pagos")
        .onAppear {
            if let uid = AuthService.shared.currentUserUID {
                let buildingId = session.currentUser?.buildingId
                vm.start(uid: uid, buildingId: buildingId)
            }
        }
    }
}

private extension Payment {
    var statusLabel: String {
        switch status {
        case .pending: return "Pendiente"
        case .paid: return "Pagado"
        case .overdue: return "Vencido"
        }
    }
}
