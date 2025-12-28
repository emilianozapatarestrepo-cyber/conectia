import SwiftUI
import Combine

struct NotificationsListView: View {
    @State private var notifications: [AppNotification] = []
    @State private var cancellables = Set<AnyCancellable>()
    
    var body: some View {
        List {
            if notifications.isEmpty {
                Text("No hay notificaciones.")
                    .foregroundColor(.secondary)
            } else {
                ForEach(notifications) { item in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(item.title).font(.headline)
                        Text(item.message).font(.subheadline).foregroundColor(.primary)
                        if let date = item.createdAt {
                            Text(date.formatted(date: .abbreviated, time: .shortened))
                                .font(.caption).foregroundColor(.secondary)
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        }
        .navigationTitle("Avisos")
        .onAppear {
            FirestoreService.shared.listenNotifications(audience: "residents")
                .receive(on: RunLoop.main)
                .sink(receiveCompletion: { _ in }, receiveValue: { self.notifications = $0 })
                .store(in: &cancellables)
        }
    }
}
