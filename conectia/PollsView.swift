import SwiftUI
import Combine

struct PollsView: View {
    @EnvironmentObject private var session: SessionManager
    @State private var polls: [Poll] = []
    @State private var cancellables = Set<AnyCancellable>()
    @State private var showingCreatePoll = false
    
    var body: some View {
        NavigationStack {
            List {
                if polls.isEmpty {
                    VStack(spacing: 12) {
                        Image(systemName: "hand.raised.square.fill")
                            .font(.largeTitle)
                            .foregroundColor(.gray)
                        Text("No hay votaciones activas.")
                            .foregroundColor(.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .center)
                    .listRowBackground(Color.clear)
                } else {
                    ForEach(polls) { poll in
                        PollCard(poll: poll)
                            .listRowSeparator(.hidden)
                    }
                }
            }
            .listStyle(.plain)
            .navigationTitle("Asamblea Digital")
            .toolbar {
                // Solo Admin/Manager crea polls
                if session.currentUser?.role == .admin || session.currentUser?.role == .manager {
                    Button {
                        showingCreatePoll = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingCreatePoll) {
                CreatePollView(onCreated: { showingCreatePoll = false })
            }
            .onAppear {
                loadPolls()
            }
        }
    }
    
    private func loadPolls() {
        guard let buildingId = session.currentUser?.buildingId else { return }
        FirestoreService.shared.listenPolls(buildingId: buildingId)
            .receive(on: RunLoop.main)
            .sink(receiveCompletion: { _ in }, receiveValue: { self.polls = $0 })
            .store(in: &cancellables)
    }
}

struct PollCard: View {
    let poll: Poll
    @EnvironmentObject private var session: SessionManager
    
    @State private var votes: [PollVote] = []
    @State private var myVote: PollVote?
    @State private var isSubmitting = false
    @State private var cancellables = Set<AnyCancellable>()
    
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(poll.question)
                    .font(.headline)
                Spacer()
                if poll.isActive {
                    Text("Activa")
                        .font(.caption)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.green.opacity(0.2))
                        .foregroundColor(.green)
                        .cornerRadius(8)
                } else {
                    Text("Cerrada")
                        .font(.caption)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.gray.opacity(0.2))
                        .foregroundColor(.gray)
                        .cornerRadius(8)
                }
            }
            
            // Opciones y resultados
            ForEach(Array(poll.options.enumerated()), id: \.offset) { index, option in
                Button {
                    Task {
                        await vote(index: index)
                    }
                } label: {
                    HStack {
                        Text(option)
                            .foregroundColor(.primary)
                        Spacer()
                        if myVote != nil {
                            // Mostrar porcentaje
                            Text("\(percentage(for: index))%")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                    .padding()
                    .background(
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                Color(.secondarySystemBackground)
                                if myVote != nil {
                                    Color.purple.opacity(0.15)
                                        .frame(width: geo.size.width * (Double(count(for: index)) / Double(max(votes.count, 1))))
                                }
                            }
                        }
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(myVote?.optionIndex == index ? Color.purple : Color.clear, lineWidth: 2)
                    )
                }
                .disabled(myVote != nil || !poll.isActive || isSubmitting)
            }
            
            HStack {
                Text("\(votes.count) votos")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Spacer()
                if isSubmitting {
                    ProgressView()
                        .scaleEffect(0.8)
                } else if myVote != nil {
                    Text("Ya votaste")
                         .font(.caption)
                         .foregroundColor(.green)
                }
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .cornerRadius(12)
        .shadow(color: .black.opacity(0.05), radius: 4, x: 0, y: 2)
        .padding(.vertical, 4)
        .onAppear {
            listenVotes()
            // Check my local vote status from list
        }
        .onChange(of: votes) { newVotes in
             checkForMyVote(in: newVotes)
        }
    }
    
    private func listenVotes() {
        guard let pid = poll.id else { return }
        FirestoreService.shared.listenPollVotes(pollId: pid)
            .receive(on: RunLoop.main)
            .sink(receiveCompletion: { _ in }, receiveValue: { self.votes = $0 })
            .store(in: &cancellables)
    }
    
    private func checkForMyVote(in votesList: [PollVote]) {
        // Chequeamos si alguno de los votos corresponde a mi usuario/unidad
        guard let user = session.currentUser else { return }
        
        // Prioridad: UnitID, fallback UID
        let identifier = user.unitId ?? user.uid
        
        self.myVote = votesList.first { $0.unitId == identifier || $0.userId == user.uid }
    }
    
    @MainActor
    private func vote(index: Int) async {
        guard let user = session.currentUser else { return }
        guard let pid = poll.id else { return }
        
        // Regla de Negocio: 1 Voto x Unidad (si está disponible), sino x Usuario
        let identifier = user.unitId ?? user.uid
        
        isSubmitting = true
        
        let newVote = PollVote(userId: user.uid, unitId: identifier, optionIndex: index)
        
        do {
            try await FirestoreService.shared.castVote(pollId: pid, vote: newVote)
            // No seteamos myVote manualmente, esperamos al listener updates para consistencia
            // Pero podriamos hacerlo optimista si se quisiera
            isSubmitting = false
        } catch {
            print("Error casting vote: \(error)")
            isSubmitting = false
        }
    }
    
    private func count(for index: Int) -> Int {
        votes.filter { $0.optionIndex == index }.count
    }
    
    private func percentage(for index: Int) -> Int {
        let c = count(for: index)
        let total = votes.count
        guard total > 0 else { return 0 }
        return Int((Double(c) / Double(total)) * 100)
    }
}

struct CreatePollView: View {
    var onCreated: () -> Void
    @EnvironmentObject private var session: SessionManager
    @Environment(\.dismiss) private var dismiss
    
    @State private var question = ""
    @State private var option1 = "Sí"
    @State private var option2 = "No"
    @State private var option3 = "Abstención"
    @State private var isSaving = false
    
    var body: some View {
        NavigationStack {
            Form {
                Section("Detalles") {
                    TextField("Pregunta", text: $question)
                }
                
                Section("Opciones") {
                    TextField("Opción 1", text: $option1)
                    TextField("Opción 2", text: $option2)
                    TextField("Opción 3", text: $option3)
                }
                
                Button {
                    Task { await create() }
                } label: {
                    if isSaving {
                        HStack {
                            Text("Publicando...")
                            Spacer()
                            ProgressView()
                        }
                    } else {
                        Text("Publicar Votación")
                    }
                }
                .disabled(question.isEmpty || isSaving)
            }
            .navigationTitle("Nueva Votación")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
            }
        }
    }
    
    @MainActor
    private func create() async {
        guard let buildingId = session.currentUser?.buildingId else { return }
        isSaving = true
        
        let poll = Poll(
            id: nil,
            buildingId: buildingId,
            question: question,
            options: [option1, option2, option3],
            isActive: true,
            votesCount: nil
        )
        
        do {
            _ = try await FirestoreService.shared.createPoll(poll)
            isSaving = false
            onCreated()
            dismiss()
        } catch {
            print("Error creating poll: \(error)")
            isSaving = false
        }
    }
}
