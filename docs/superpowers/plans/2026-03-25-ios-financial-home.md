# iOS Financial Home Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded `BuildingFinancialsView.swift` with a real data-driven admin financial home that consumes the Express API, displaying the hybrid A+B layout (financial KPIs prominent + compact operations section).

**Architecture:** New `Financial/` module in the iOS target with its own `APIClient` (URLSession + Firebase JWT), `DashboardRepository` (async/await data access), and `DashboardViewModel` (@MainActor ObservableObject). The `AdminTabView` gains a first-position "Finanzas" tab pointing to `AdminFinancialHomeView`. Financial data comes exclusively from the Express API — never from Firestore. Non-financial state (tickets, announcements) stays in Firestore as before.

**Tech Stack:** SwiftUI, Swift Charts (iOS 16+), URLSession + async/await, Firebase Auth (ID token), XCTest + async test support, Xcode project.pbxproj file registration (manual steps called out explicitly).

---

## File Structure

**New files to create:**
- `conectia/Extensions/Array+Safe.swift` — Safe subscript extension (single source of truth)
- `conectia/Financial/CurrencyFormatter.swift` — `formatCOP(centavos:)` helper
- `conectia/Financial/DashboardModels.swift` — All Codable response models
- `conectia/Financial/APIClient.swift` — URLSession HTTP client with Firebase JWT auth
- `conectia/Financial/DashboardRepository.swift` — Async data access layer + protocol for testing
- `conectia/Financial/DashboardViewModel.swift` — @MainActor ObservableObject, parallel fetches
- `conectia/Financial/Components/FinancialKpiCard.swift` — Generic KPI card
- `conectia/Financial/Components/RecaudoProgressBar.swift` — Recaudo vs presupuesto bar
- `conectia/Financial/Components/HealthScoreBadge.swift` — 0-100 score with color ring
- `conectia/Financial/Components/MiniTrendChart.swift` — Last 6 months bar chart
- `conectia/Financial/Components/DelinquentRow.swift` — Single delinquent unit row
- `conectia/Financial/Components/AlertBanner.swift` — Alert severity banner
- `conectia/Financial/AdminFinancialHomeView.swift` — Hybrid A+B main view

> **Path convention:** All source files live in the `conectia/` directory at the same level as `AdminTabView.swift`. New files are placed in logical subdirectories (`Financial/`, `Extensions/`) and added to matching Xcode groups. Test files live in `conectiaTests/Financial/`.

**Files to modify:**
- `conectia/AdminTabView.swift` — Add "Finanzas" as first tab
- `conectia/BuildingFinancialsView.swift` — Replace body with `AdminFinancialHomeView()`

**New test files:**
- `conectiaTests/Financial/CurrencyFormatterTests.swift`
- `conectiaTests/Financial/DashboardModelsTests.swift`
- `conectiaTests/Financial/APIClientTests.swift`
- `conectiaTests/Financial/DashboardRepositoryTests.swift`
- `conectiaTests/Financial/DashboardViewModelTests.swift`

> **Xcode registration note:** Every new `.swift` file must be added to the Xcode project via Xcode's "Add Files to conectia" (or via Xcode's File Navigator drag). The plan calls this out explicitly at each task. Alternatively, use `xcodebuild` to verify files are picked up.

---

## Chunk 1: Infrastructure — APIClient, Models, Repository

### Task 0: Array+Safe Extension (shared utility)

**Files:**
- Create: `conectia/Extensions/Array+Safe.swift`

> This task must run **before** all others. `DashboardModels`, `RecaudoProgressBar`, and `MiniTrendChart` all need `array[safe: index]`. Defining it once prevents duplication bugs.

- [ ] **Step 1: Create Array+Safe.swift**

Create `conectia/Extensions/Array+Safe.swift`:

```swift
import Foundation

extension Array {
    /// Returns the element at the given index, or nil if out of bounds.
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
```

- [ ] **Step 2: Add to Xcode**

In Xcode: create `conectia/Extensions` group → Add Files → `Array+Safe.swift`. Target: `conectia`.

- [ ] **Step 3: Build — expect no errors**

`Cmd+B`. Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add conectia/Extensions/Array+Safe.swift
git commit -m "feat(ios): add Array+safe subscript extension"
```

---

### Task 1: CurrencyFormatter

**Files:**
- Create: `conectia/Financial/CurrencyFormatter.swift`
- Create: `conectiaTests/Financial/CurrencyFormatterTests.swift`

- [ ] **Step 1: Create test file**

Create `conectiaTests/Financial/CurrencyFormatterTests.swift`:

```swift
import XCTest
@testable import conectia

final class CurrencyFormatterTests: XCTestCase {

    func test_formatCOP_roundsToNoDecimals() {
        XCTAssertEqual(formatCOP(centavos: 100_000_00), "$100.000")
    }

    func test_formatCOP_zerocents() {
        XCTAssertEqual(formatCOP(centavos: 0), "$0")
    }

    func test_formatCOP_millionPesos() {
        XCTAssertEqual(formatCOP(centavos: 1_000_000_00), "$1.000.000")
    }

    func test_formatCOP_fractionalCentavosRoundedDown() {
        // 1050 centavos = 10.50 pesos → displayed as $10 (no decimal places for COP)
        XCTAssertEqual(formatCOP(centavos: 1050), "$10")
    }
}
```

- [ ] **Step 2: Add test file to Xcode**

In Xcode: right-click `conectiaTests` group → Add Files → select `conectiaTests/Financial/CurrencyFormatterTests.swift`. Ensure target membership is `conectiaTests`.

- [ ] **Step 3: Run tests — expect FAIL (function not found)**

In Xcode: `Cmd+U`. Expected: build error "use of unresolved identifier 'formatCOP'".

- [ ] **Step 4: Create the formatter**

Create `conectia/Financial/CurrencyFormatter.swift`:

```swift
import Foundation

/// Formats an amount expressed in centavos (Colombian peso cents) into a
/// human-readable COP string. Example: 100_000_00 centavos → "$100.000"
///
/// - Parameter centavos: Amount in centavos (1 COP = 100 centavos).
/// - Returns: Formatted string using Colombian locale, no decimal places.
func formatCOP(centavos: Int64) -> String {
    let pesos = Double(centavos) / 100.0
    let formatter = NumberFormatter()
    formatter.numberStyle = .currency
    formatter.currencyCode = "COP"
    formatter.currencySymbol = "$"
    formatter.maximumFractionDigits = 0
    formatter.minimumFractionDigits = 0
    // Colombian grouping: periods as thousands separator
    formatter.groupingSeparator = "."
    formatter.groupingSize = 3
    formatter.usesGroupingSeparator = true
    return formatter.string(from: NSNumber(value: pesos)) ?? "$0"
}
```

- [ ] **Step 5: Add source file to Xcode**

In Xcode: right-click `conectia` group → New Group "Financial" → Add Files → select `CurrencyFormatter.swift`. Ensure target membership is `conectia`.

- [ ] **Step 6: Run tests — expect PASS**

`Cmd+U`. Expected: `CurrencyFormatterTests` — 4 tests pass.

- [ ] **Step 7: Commit**

```bash
git add conectia/Financial/CurrencyFormatter.swift conectiaTests/Financial/CurrencyFormatterTests.swift
git commit -m "feat(ios): add CurrencyFormatter with COP formatting"
```

---

### Task 2: DashboardModels

**Files:**
- Create: `conectia/Financial/DashboardModels.swift`
- Create: `conectiaTests/Financial/DashboardModelsTests.swift`

> **Important:** The Express API sends monetary amounts as JSON **strings** (not numbers) because PostgreSQL `NUMERIC` values are serialized as strings by the `pg` driver to avoid JavaScript BigInt precision loss. The Swift models must decode these fields as `String` and expose computed `Int64` helpers.

- [ ] **Step 1: Write model tests**

Create `conectiaTests/Financial/DashboardModelsTests.swift`:

```swift
import XCTest
@testable import conectia

final class DashboardModelsTests: XCTestCase {

    // MARK: - DashboardSummaryResponse

    func test_decodeSummary_validJSON() throws {
        let json = """
        {
          "period": "2026-03",
          "recaudado": "250000000",
          "presupuestado": "300000000",
          "recaudoPct": 83.33,
          "moraPct": 12.5,
          "pendingCount": 15,
          "pendingAmount": "45000000",
          "conciliacionPendingCount": 2,
          "healthScore": {
            "score": 72,
            "color": "yellow",
            "label": "Regular"
          }
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(DashboardSummaryResponse.self, from: json)

        XCTAssertEqual(response.period, "2026-03")
        XCTAssertEqual(response.recaudadoCentavos, 250_000_000)
        XCTAssertEqual(response.presupuestadoCentavos, 300_000_000)
        XCTAssertEqual(response.recaudoPct, 83.33, accuracy: 0.01)
        XCTAssertEqual(response.moraPct, 12.5, accuracy: 0.01)
        XCTAssertEqual(response.pendingCount, 15)
        XCTAssertEqual(response.pendingAmountCentavos, 45_000_000)
        XCTAssertEqual(response.conciliacionPendingCount, 2)
        XCTAssertEqual(response.healthScore.score, 72)
        XCTAssertEqual(response.healthScore.color, "yellow")
    }

    // MARK: - TrendResponse

    func test_decodeTrend_validJSON() throws {
        let json = """
        {
          "trend": [
            { "month": "2025-10", "recaudado": "200000000", "presupuestado": "300000000" },
            { "month": "2025-11", "recaudado": "250000000", "presupuestado": "300000000" }
          ]
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(TrendResponse.self, from: json)

        XCTAssertEqual(response.trend.count, 2)
        XCTAssertEqual(response.trend[0].month, "2025-10")
        XCTAssertEqual(response.trend[0].recaudadoCentavos, 200_000_000)
        XCTAssertEqual(response.trend[1].presupuestadoCentavos, 300_000_000)
    }

    // MARK: - AlertsResponse

    func test_decodeAlerts_validJSON() throws {
        let json = """
        {
          "alerts": [
            {
              "id": "alert-1",
              "type": "mora_critica",
              "message": "Unidad 301 lleva 3+ meses sin pagar",
              "severity": "critical",
              "unitId": "unit-301",
              "createdAt": "2026-03-25T10:00:00Z"
            }
          ]
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(AlertsResponse.self, from: json)

        XCTAssertEqual(response.alerts.count, 1)
        XCTAssertEqual(response.alerts[0].id, "alert-1")
        XCTAssertEqual(response.alerts[0].severity, "critical")
    }

    // MARK: - DelinquentResponse

    func test_decodeDelinquent_validJSON() throws {
        let json = """
        {
          "units": [
            {
              "id": "unit-301",
              "unitNumber": "301",
              "ownerName": "Carlos López",
              "monthsDelinquent": 3,
              "amountDue": "450000"
            }
          ],
          "totalDelinquent": 1,
          "totalAmount": "450000"
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(DelinquentResponse.self, from: json)

        XCTAssertEqual(response.units.count, 1)
        XCTAssertEqual(response.units[0].amountDueCentavos, 450_000)
        XCTAssertEqual(response.units[0].monthsDelinquent, 3)
        XCTAssertEqual(response.totalDelinquentCount, 1)
    }
}
```

- [ ] **Step 2: Add test file to Xcode**

In Xcode: right-click `conectiaTests/Financial` group → Add Files → select `DashboardModelsTests.swift`. Ensure target membership is `conectiaTests`.

- [ ] **Step 3: Run tests — expect FAIL (types not found)**

`Cmd+U`. Expected: build errors for all `DashboardSummaryResponse`, `TrendResponse`, `AlertsResponse`, `DelinquentResponse`.

- [ ] **Step 4: Create DashboardModels.swift**

Create `conectia/Financial/DashboardModels.swift`:

```swift
import Foundation

// MARK: - Dashboard Summary

/// Full financial summary for a building's current period.
/// Amounts are delivered as strings from the API to preserve Int64 precision.
struct DashboardSummaryResponse: Codable {
    let period: String          // "YYYY-MM"
    let recaudado: String       // centavos as decimal string
    let presupuestado: String   // centavos as decimal string
    let recaudoPct: Double      // 0–100
    let moraPct: Double         // 0–100
    let pendingCount: Int       // charges pending payment
    let pendingAmount: String   // centavos as decimal string
    let conciliacionPendingCount: Int
    let healthScore: HealthScore

    var recaudadoCentavos: Int64    { Int64(recaudado) ?? 0 }
    var presupuestadoCentavos: Int64 { Int64(presupuestado) ?? 0 }
    var pendingAmountCentavos: Int64 { Int64(pendingAmount) ?? 0 }
}

/// Financial health score computed server-side.
/// Formula: (recaudoPct × 0.50) + (100 − moraPct×10)×0.30 + conciliacionScore×0.20
struct HealthScore: Codable {
    let score: Int      // 0–100
    let color: String   // "green" | "yellow" | "red"
    let label: String   // e.g. "Excelente", "Regular", "Crítico"

    var swiftColor: HealthScoreColor {
        switch color {
        case "green":  return .green
        case "yellow": return .yellow
        default:       return .red
        }
    }
}

enum HealthScoreColor {
    case green, yellow, red
}

// MARK: - Trend

struct TrendPoint: Codable, Identifiable {
    var id: String { month }
    let month: String           // "YYYY-MM"
    let recaudado: String       // centavos as decimal string
    let presupuestado: String   // centavos as decimal string

    var recaudadoCentavos: Int64    { Int64(recaudado) ?? 0 }
    var presupuestadoCentavos: Int64 { Int64(presupuestado) ?? 0 }

    /// Short display label: "Oct", "Nov", etc.
    /// Uses Array+Safe.swift extension (conectia/Extensions/Array+Safe.swift).
    var shortLabel: String {
        let parts = month.split(separator: "-")
        guard parts.count == 2, let monthNum = Int(parts[1]) else { return month }
        let formatter = DateFormatter()
        return formatter.shortMonthSymbols[safe: monthNum - 1] ?? month
    }
}

struct TrendResponse: Codable {
    let trend: [TrendPoint]
}

// MARK: - Alerts

struct DashboardAlert: Codable, Identifiable {
    let id: String
    let type: String        // "mora_critica" | "vencimiento_proximo" | "conciliacion_pendiente"
    let message: String
    let severity: String    // "critical" | "warning" | "info"
    let unitId: String?
    let createdAt: String   // ISO-8601 string

    var alertSeverity: AlertSeverity {
        switch severity {
        case "critical": return .critical
        case "warning":  return .warning
        default:         return .info
        }
    }
}

enum AlertSeverity {
    case critical, warning, info
}

struct AlertsResponse: Codable {
    let alerts: [DashboardAlert]
}

// MARK: - Delinquency

/// A unit in arrears, ranked by months overdue then amount.
/// monthsDelinquent: 1 = 1-30 days, 2 = 31-60 days, 3 = 61+ days (critical)
struct DelinquentUnit: Codable, Identifiable {
    let id: String
    let unitNumber: String
    let ownerName: String
    let monthsDelinquent: Int   // 1, 2, or 3
    let amountDue: String       // centavos as decimal string

    var amountDueCentavos: Int64 { Int64(amountDue) ?? 0 }

    var isCritical: Bool { monthsDelinquent >= 3 }
}

struct DelinquentResponse: Codable {
    let units: [DelinquentUnit]
    let totalDelinquent: Int
    let totalAmount: String     // centavos as decimal string

    var totalDelinquentCount: Int { totalDelinquent }
    var totalAmountCentavos: Int64 { Int64(totalAmount) ?? 0 }
}

// Note: Array[safe:] is defined in conectia/Extensions/Array+Safe.swift
```

- [ ] **Step 5: Add source file to Xcode**

In Xcode: right-click `conectia/Financial` group → Add Files → select `DashboardModels.swift`. Ensure target membership is `conectia`.

- [ ] **Step 6: Run tests — expect PASS**

`Cmd+U`. Expected: `DashboardModelsTests` — 4 tests pass.

- [ ] **Step 7: Commit**

```bash
git add conectia/Financial/DashboardModels.swift conectiaTests/Financial/DashboardModelsTests.swift
git commit -m "feat(ios): add DashboardModels with Codable response types"
```

---

### Task 3: APIClient

**Files:**
- Create: `conectia/Financial/APIClient.swift`
- Create: `conectiaTests/Financial/APIClientTests.swift`

- [ ] **Step 1: Write API client tests**

Create `conectiaTests/Financial/APIClientTests.swift`:

```swift
import XCTest
@testable import conectia

// MARK: - Mock URLSession

final class MockURLProtocol: URLProtocol {
    static var requestHandler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let handler = MockURLProtocol.requestHandler else {
            client?.urlProtocol(self, didFailWithError: URLError(.unknown))
            return
        }
        do {
            let (response, data) = try handler(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

struct MockResponse: Codable { let value: String }

// MARK: - Tests

final class APIClientTests: XCTestCase {

    private var mockSession: URLSession!
    private var client: APIClient!

    override func setUp() {
        super.setUp()
        let config = URLSessionConfiguration.ephemeral
        config.protocolClasses = [MockURLProtocol.self]
        mockSession = URLSession(configuration: config)
        client = APIClient(
            session: mockSession,
            baseURL: URL(string: "http://test.local")!,
            tokenProvider: { "mock-token" }
        )
    }

    override func tearDown() {
        MockURLProtocol.requestHandler = nil
        super.tearDown()
    }

    func test_get_attachesAuthorizationHeader() async throws {
        MockURLProtocol.requestHandler = { request in
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer mock-token")
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            let data = try JSONEncoder().encode(MockResponse(value: "ok"))
            return (response, data)
        }

        let _: MockResponse = try await client.get("/test")
        // No assertion needed — the handler XCTAssert above is enough
    }

    func test_get_throwsHTTPError_on4xx() async {
        MockURLProtocol.requestHandler = { request in
            let response = HTTPURLResponse(url: request.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!
            return (response, Data())
        }

        do {
            let _: MockResponse = try await client.get("/test")
            XCTFail("Expected APIError.httpError")
        } catch APIError.httpError(let code, _) {
            XCTAssertEqual(code, 401)
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    func test_get_throwsDecodingError_onBadJSON() async {
        MockURLProtocol.requestHandler = { request in
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (response, Data("not-json".utf8))
        }

        do {
            let _: MockResponse = try await client.get("/test")
            XCTFail("Expected APIError.decodingError")
        } catch APIError.decodingError {
            // pass
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }

    func test_get_appendsQueryItems() async throws {
        MockURLProtocol.requestHandler = { request in
            XCTAssertTrue(request.url?.absoluteString.contains("months=6") == true)
            let response = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            let data = try JSONEncoder().encode(MockResponse(value: "ok"))
            return (response, data)
        }

        let _: MockResponse = try await client.get(
            "/trend",
            queryItems: [URLQueryItem(name: "months", value: "6")]
        )
    }
}
```

- [ ] **Step 2: Add test file to Xcode**

In Xcode: right-click `conectiaTests/Financial` group → Add Files → `APIClientTests.swift`. Target: `conectiaTests`.

- [ ] **Step 3: Run tests — expect FAIL (APIClient not found)**

`Cmd+U`. Expected: build error "cannot find type 'APIClient'".

- [ ] **Step 4: Create APIClient.swift**

Create `conectia/Financial/APIClient.swift`:

```swift
import Foundation
import FirebaseAuth

// MARK: - Error Types

enum APIError: LocalizedError {
    case noAuthToken
    case httpError(statusCode: Int, body: String)
    case decodingError(Error)
    case networkError(Error)

    var errorDescription: String? {
        switch self {
        case .noAuthToken:
            return "No hay sesión activa. Por favor inicia sesión."
        case .httpError(let code, _):
            return "Error del servidor (\(code)). Intenta de nuevo."
        case .decodingError:
            return "Error al procesar la respuesta del servidor."
        case .networkError:
            return "Error de conexión. Verifica tu internet."
        }
    }
}

// MARK: - Protocol (for testability)

protocol APIClientProtocol {
    func get<T: Decodable>(_ path: String, queryItems: [URLQueryItem]) async throws -> T
}

extension APIClientProtocol {
    /// Convenience overload — no query items
    func get<T: Decodable>(_ path: String) async throws -> T {
        try await get(path, queryItems: [])
    }
}

// MARK: - Implementation

final class APIClient: APIClientProtocol {
    static let shared = APIClient()

    private let session: URLSession
    private let baseURL: URL
    private let tokenProvider: () async throws -> String

    /// Production init — reads base URL from Info.plist key "API_BASE_URL".
    convenience init() {
        let rawURL = Bundle.main.infoDictionary?["API_BASE_URL"] as? String
            ?? "http://localhost:3000"
        self.init(
            session: .shared,
            baseURL: URL(string: rawURL)!,
            tokenProvider: {
                guard let user = Auth.auth().currentUser else {
                    throw APIError.noAuthToken
                }
                return try await user.getIDToken()
            }
        )
    }

    /// Testable init — inject custom session and token provider.
    init(
        session: URLSession,
        baseURL: URL,
        tokenProvider: @escaping () async throws -> String
    ) {
        self.session = session
        self.baseURL = baseURL
        self.tokenProvider = tokenProvider
    }

    // Protocol conformance: no default parameter here — the protocol extension
    // on APIClientProtocol provides the zero-argument convenience overload.
    func get<T: Decodable>(_ path: String, queryItems: [URLQueryItem]) async throws -> T {
        let token = try await tokenProvider()

        var components = URLComponents(
            url: baseURL.appendingPathComponent(path),
            resolvingAgainstBaseURL: false
        )!
        if !queryItems.isEmpty {
            components.queryItems = queryItems
        }

        guard let url = components.url else {
            throw APIError.networkError(URLError(.badURL))
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 15

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw APIError.networkError(error)
        }

        guard let http = response as? HTTPURLResponse else {
            throw APIError.networkError(URLError(.badServerResponse))
        }

        guard (200...299).contains(http.statusCode) else {
            let body = String(data: data, encoding: .utf8) ?? ""
            throw APIError.httpError(statusCode: http.statusCode, body: body)
        }

        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw APIError.decodingError(error)
        }
    }
}
```

- [ ] **Step 5: Add source file to Xcode**

In Xcode: `conectia/Financial` group → Add Files → `APIClient.swift`. Target: `conectia`.

- [ ] **Step 6: Run tests — expect PASS**

`Cmd+U`. Expected: `APIClientTests` — 4 tests pass.

- [ ] **Step 7: Commit**

```bash
git add conectia/Financial/APIClient.swift conectiaTests/Financial/APIClientTests.swift
git commit -m "feat(ios): add APIClient with Firebase JWT auth and mock URLProtocol tests"
```

---

### Task 4: DashboardRepository

**Files:**
- Create: `conectia/Financial/DashboardRepository.swift`
- Create: `conectiaTests/Financial/DashboardRepositoryTests.swift`

- [ ] **Step 1: Write repository tests**

Create `conectiaTests/Financial/DashboardRepositoryTests.swift`:

```swift
import XCTest
@testable import conectia

// MARK: - Mock API Client

final class MockAPIClient: APIClientProtocol {
    var stubbedResponses: [String: Any] = [:]
    var calledPaths: [String] = []

    func get<T: Decodable>(_ path: String, queryItems: [URLQueryItem]) async throws -> T {
        calledPaths.append(path)
        guard let stub = stubbedResponses[path] as? T else {
            throw APIError.httpError(statusCode: 500, body: "No stub for \(path)")
        }
        return stub
    }
}

// MARK: - Tests

final class DashboardRepositoryTests: XCTestCase {

    private var mockAPI: MockAPIClient!
    private var repository: DashboardRepository!

    override func setUp() {
        super.setUp()
        mockAPI = MockAPIClient()
        repository = DashboardRepository(api: mockAPI)
    }

    func test_fetchSummary_callsCorrectEndpoint() async throws {
        mockAPI.stubbedResponses["/api/v1/dashboard/summary"] = makeSummaryStub()

        _ = try await repository.fetchSummary()

        XCTAssertTrue(mockAPI.calledPaths.contains("/api/v1/dashboard/summary"))
    }

    func test_fetchTrend_callsCorrectEndpoint() async throws {
        mockAPI.stubbedResponses["/api/v1/dashboard/trend"] = TrendResponse(trend: [])

        _ = try await repository.fetchTrend(months: 6)

        XCTAssertTrue(mockAPI.calledPaths.contains("/api/v1/dashboard/trend"))
    }

    func test_fetchAlerts_callsCorrectEndpoint() async throws {
        mockAPI.stubbedResponses["/api/v1/dashboard/alerts"] = AlertsResponse(alerts: [])

        _ = try await repository.fetchAlerts()

        XCTAssertTrue(mockAPI.calledPaths.contains("/api/v1/dashboard/alerts"))
    }

    func test_fetchDelinquent_callsCorrectEndpoint() async throws {
        mockAPI.stubbedResponses["/api/v1/charges/delinquent"] = DelinquentResponse(
            units: [], totalDelinquent: 0, totalAmount: "0"
        )

        _ = try await repository.fetchDelinquent()

        XCTAssertTrue(mockAPI.calledPaths.contains("/api/v1/charges/delinquent"))
    }

    func test_fetchSummary_propagatesAPIError() async {
        // No stub → MockAPIClient throws httpError(500)
        do {
            _ = try await repository.fetchSummary()
            XCTFail("Expected error to propagate")
        } catch APIError.httpError(let code, _) {
            XCTAssertEqual(code, 500)
        } catch {
            XCTFail("Unexpected error type: \(error)")
        }
    }

    // MARK: - Helpers

    private func makeSummaryStub() -> DashboardSummaryResponse {
        DashboardSummaryResponse(
            period: "2026-03",
            recaudado: "250000000",
            presupuestado: "300000000",
            recaudoPct: 83.33,
            moraPct: 12.5,
            pendingCount: 15,
            pendingAmount: "45000000",
            conciliacionPendingCount: 2,
            healthScore: HealthScore(score: 72, color: "yellow", label: "Regular")
        )
    }
}
```

- [ ] **Step 2: Add test file to Xcode**

In Xcode: `conectiaTests/Financial` → Add Files → `DashboardRepositoryTests.swift`. Target: `conectiaTests`.

- [ ] **Step 3: Run tests — expect FAIL**

`Cmd+U`. Expected: build error "cannot find type 'DashboardRepository'".

- [ ] **Step 4: Create DashboardRepository.swift**

Create `conectia/Financial/DashboardRepository.swift`:

```swift
import Foundation

// MARK: - Protocol

/// The buildingId is NOT passed as a parameter to these methods because the
/// Express API derives tenant context from the Firebase JWT token via
/// `requireTenant` middleware. The repository has no need to know the building ID.
protocol DashboardRepositoryProtocol {
    func fetchSummary() async throws -> DashboardSummaryResponse
    func fetchTrend(months: Int) async throws -> TrendResponse
    func fetchAlerts() async throws -> AlertsResponse
    func fetchDelinquent() async throws -> DelinquentResponse
}

// MARK: - Implementation

final class DashboardRepository: DashboardRepositoryProtocol {

    private let api: APIClientProtocol

    init(api: APIClientProtocol = APIClient.shared) {
        self.api = api
    }

    func fetchSummary() async throws -> DashboardSummaryResponse {
        try await api.get("/api/v1/dashboard/summary")
    }

    func fetchTrend(months: Int) async throws -> TrendResponse {
        try await api.get(
            "/api/v1/dashboard/trend",
            queryItems: [URLQueryItem(name: "months", value: "\(months)")]
        )
    }

    func fetchAlerts() async throws -> AlertsResponse {
        try await api.get("/api/v1/dashboard/alerts")
    }

    func fetchDelinquent() async throws -> DelinquentResponse {
        try await api.get("/api/v1/charges/delinquent")
    }
}
```

- [ ] **Step 5: Add source file to Xcode**

In Xcode: `conectia/Financial` → Add Files → `DashboardRepository.swift`. Target: `conectia`.

- [ ] **Step 6: Run tests — expect PASS**

`Cmd+U`. Expected: `DashboardRepositoryTests` — 5 tests pass.

- [ ] **Step 7: Commit**

```bash
git add conectia/Financial/DashboardRepository.swift conectiaTests/Financial/DashboardRepositoryTests.swift
git commit -m "feat(ios): add DashboardRepository with protocol for testability"
```

---

## Chunk 2: ViewModel + Components + AdminFinancialHomeView

### Task 5: DashboardViewModel

**Files:**
- Create: `conectia/Financial/DashboardViewModel.swift`
- Create: `conectiaTests/Financial/DashboardViewModelTests.swift`

- [ ] **Step 1: Write ViewModel tests**

Create `conectiaTests/Financial/DashboardViewModelTests.swift`:

```swift
import XCTest
@testable import conectia

// MARK: - Mock Repository

final class MockDashboardRepository: DashboardRepositoryProtocol {
    var summaryResult: Result<DashboardSummaryResponse, Error> = .failure(APIError.httpError(statusCode: 500, body: ""))
    var trendResult: Result<TrendResponse, Error> = .success(TrendResponse(trend: []))
    var alertsResult: Result<AlertsResponse, Error> = .success(AlertsResponse(alerts: []))
    var delinquentResult: Result<DelinquentResponse, Error> = .success(
        DelinquentResponse(units: [], totalDelinquent: 0, totalAmount: "0")
    )

    func fetchSummary() async throws -> DashboardSummaryResponse {
        try summaryResult.get()
    }
    func fetchTrend(months: Int) async throws -> TrendResponse {
        try trendResult.get()
    }
    func fetchAlerts() async throws -> AlertsResponse {
        try alertsResult.get()
    }
    func fetchDelinquent() async throws -> DelinquentResponse {
        try delinquentResult.get()
    }
}

// MARK: - Tests

@MainActor
final class DashboardViewModelTests: XCTestCase {

    private var mockRepo: MockDashboardRepository!
    private var vm: DashboardViewModel!

    override func setUp() {
        super.setUp()
        mockRepo = MockDashboardRepository()
        vm = DashboardViewModel(repository: mockRepo)
    }

    func test_initialState_isIdleNotLoading() {
        XCTAssertFalse(vm.isLoading)
        XCTAssertNil(vm.summary)
        XCTAssertNil(vm.error)
        XCTAssertTrue(vm.trend.isEmpty)
    }

    func test_load_setsIsLoadingTrue_thenFalse() async {
        mockRepo.summaryResult = .success(makeSummaryStub())

        await vm.load()

        XCTAssertFalse(vm.isLoading, "isLoading should be false after load completes")
    }

    func test_load_success_populatesSummary() async {
        let stub = makeSummaryStub()
        mockRepo.summaryResult = .success(stub)

        await vm.load()

        XCTAssertNotNil(vm.summary)
        XCTAssertEqual(vm.summary?.period, "2026-03")
        XCTAssertEqual(vm.summary?.healthScore.score, 72)
        XCTAssertNil(vm.error)
    }

    func test_load_failure_setsError() async {
        mockRepo.summaryResult = .failure(APIError.noAuthToken)

        await vm.load()

        XCTAssertNotNil(vm.error)
        XCTAssertNil(vm.summary)
    }

    func test_load_limitsTopDelinquentToThree() async {
        mockRepo.summaryResult = .success(makeSummaryStub())
        mockRepo.delinquentResult = .success(DelinquentResponse(
            units: [
                makeDelinquentUnit(id: "1"),
                makeDelinquentUnit(id: "2"),
                makeDelinquentUnit(id: "3"),
                makeDelinquentUnit(id: "4"),
                makeDelinquentUnit(id: "5"),
            ],
            totalDelinquent: 5,
            totalAmount: "2250000"
        ))

        await vm.load()

        XCTAssertEqual(vm.topDelinquent.count, 3, "Only top 3 delinquent units shown on home")
    }

    func test_load_fetchesAllDataInParallel() async {
        // All results succeed — no hang, no error
        mockRepo.summaryResult = .success(makeSummaryStub())
        mockRepo.trendResult = .success(TrendResponse(trend: [makeTrendPoint()]))
        mockRepo.alertsResult = .success(AlertsResponse(alerts: [makeAlert()]))

        await vm.load()

        XCTAssertEqual(vm.trend.count, 1)
        XCTAssertEqual(vm.alerts.count, 1)
    }

    // MARK: - Helpers

    private func makeSummaryStub() -> DashboardSummaryResponse {
        DashboardSummaryResponse(
            period: "2026-03",
            recaudado: "250000000",
            presupuestado: "300000000",
            recaudoPct: 83.33,
            moraPct: 12.5,
            pendingCount: 15,
            pendingAmount: "45000000",
            conciliacionPendingCount: 2,
            healthScore: HealthScore(score: 72, color: "yellow", label: "Regular")
        )
    }

    private func makeDelinquentUnit(id: String) -> DelinquentUnit {
        DelinquentUnit(id: id, unitNumber: "3\(id)1", ownerName: "Test User", monthsDelinquent: 2, amountDue: "450000")
    }

    private func makeTrendPoint() -> TrendPoint {
        TrendPoint(month: "2026-03", recaudado: "250000000", presupuestado: "300000000")
    }

    private func makeAlert() -> DashboardAlert {
        DashboardAlert(id: "a1", type: "mora_critica", message: "Test", severity: "critical", unitId: nil, createdAt: "2026-03-25T00:00:00Z")
    }
}
```

- [ ] **Step 2: Add test file to Xcode**

In Xcode: `conectiaTests/Financial` → Add Files → `DashboardViewModelTests.swift`. Target: `conectiaTests`.

- [ ] **Step 3: Run tests — expect FAIL**

`Cmd+U`. Expected: build error "cannot find type 'DashboardViewModel'".

- [ ] **Step 4: Create DashboardViewModel.swift**

Create `conectia/Financial/DashboardViewModel.swift`:

```swift
import Foundation

/// Financial dashboard state for the admin home screen.
/// All mutations happen on the main actor; fetch happens in parallel via async let.
@MainActor
final class DashboardViewModel: ObservableObject {

    // MARK: - Published state

    @Published private(set) var summary: DashboardSummaryResponse?
    @Published private(set) var trend: [TrendPoint] = []
    @Published private(set) var alerts: [DashboardAlert] = []
    @Published private(set) var topDelinquent: [DelinquentUnit] = []
    @Published private(set) var isLoading: Bool = false
    @Published private(set) var error: String?

    // MARK: - Dependencies

    private let repository: DashboardRepositoryProtocol

    // MARK: - Init

    /// Testable init — inject any DashboardRepositoryProtocol.
    init(repository: DashboardRepositoryProtocol) {
        self.repository = repository
    }

    /// Production init — uses the default DashboardRepository (Express API via Firebase JWT).
    convenience init() {
        self.init(repository: DashboardRepository())
    }

    // MARK: - Actions

    /// Fetches all dashboard data in parallel. Sets isLoading while in-flight.
    /// Tenant context (buildingId) is derived server-side from the Firebase JWT token —
    /// the ViewModel does not need to know the building ID.
    /// On any error, sets `error` with a user-facing message and keeps previous data intact.
    func load() async {
        isLoading = true
        error = nil

        do {
            // Parallel fetch — all four requests fly simultaneously
            async let summaryTask = repository.fetchSummary()
            async let trendTask = repository.fetchTrend(months: 6)
            async let alertsTask = repository.fetchAlerts()
            async let delinquentTask = repository.fetchDelinquent()

            let (s, t, a, d) = try await (summaryTask, trendTask, alertsTask, delinquentTask)

            summary = s
            trend = t.trend
            alerts = a.alerts
            topDelinquent = Array(d.units.prefix(3))  // Only top 3 on home screen

        } catch {
            self.error = error.localizedDescription
        }

        isLoading = false
    }
}
```

- [ ] **Step 5: Add source file to Xcode**

In Xcode: `conectia/Financial` → Add Files → `DashboardViewModel.swift`. Target: `conectia`.

- [ ] **Step 6: Run tests — expect PASS**

`Cmd+U`. Expected: `DashboardViewModelTests` — 6 tests pass.

- [ ] **Step 7: Commit**

```bash
git add conectia/Financial/DashboardViewModel.swift conectiaTests/Financial/DashboardViewModelTests.swift
git commit -m "feat(ios): add DashboardViewModel with parallel fetch and error handling"
```

---

### Task 6: Shared Components (KpiCard, ProgressBar, HealthScoreBadge)

**Files:**
- Create: `conectia/Financial/Components/FinancialKpiCard.swift`
- Create: `conectia/Financial/Components/RecaudoProgressBar.swift`
- Create: `conectia/Financial/Components/HealthScoreBadge.swift`

> No unit tests for pure SwiftUI views. These are verified visually in Task 8 (Xcode Preview).

- [ ] **Step 1: Create FinancialKpiCard.swift**

Create `conectia/Financial/Components/FinancialKpiCard.swift`:

```swift
import SwiftUI

/// A generic KPI card used in the 2×2 grid on the financial home screen.
/// - title: e.g. "Recaudado", "Mora"
/// - value: formatted string, e.g. "$1.200.000" or "12.5%"
/// - subtitle: secondary context, e.g. "vs $1.5M presupuestado"
/// - accentColor: semantic color for the value (green for good, red for bad)
struct FinancialKpiCard: View {
    let title: String
    let value: String
    let subtitle: String
    let accentColor: Color
    var icon: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(title)
                    .font(.caption)
                    .foregroundColor(.textBody)
                    .lineLimit(1)
                Spacer()
                if let icon {
                    Image(systemName: icon)
                        .font(.caption)
                        .foregroundColor(accentColor)
                }
            }

            Text(value)
                .font(.system(.title3, design: .rounded).weight(.bold))
                .foregroundColor(accentColor)
                .lineLimit(1)
                .minimumScaleFactor(0.7)

            Text(subtitle)
                .font(.caption2)
                .foregroundColor(.textBody)
                .lineLimit(2)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .softCardStyle()
    }
}

#Preview {
    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
        FinancialKpiCard(title: "Recaudado", value: "$2.400.000", subtitle: "de $3M presupuestado", accentColor: .brandSecondary, icon: "arrow.up.circle.fill")
        FinancialKpiCard(title: "Pendiente", value: "$600.000", subtitle: "15 cuotas sin pagar", accentColor: .orange, icon: "clock.fill")
        FinancialKpiCard(title: "Mora", value: "12.5%", subtitle: "19 unidades en mora", accentColor: .red, icon: "exclamationmark.triangle.fill")
        FinancialKpiCard(title: "Conciliación", value: "2 pendientes", subtitle: "Requieren revisión", accentColor: .yellow, icon: "doc.badge.clock")
    }
    .padding()
}
```

- [ ] **Step 2: Create RecaudoProgressBar.swift**

Create `conectia/Financial/Components/RecaudoProgressBar.swift`:

```swift
import SwiftUI

/// Horizontal progress bar showing recaudado vs presupuestado for the current period.
/// The bar fills proportionally; color is green (>80%), yellow (60-80%), red (<60%).
struct RecaudoProgressBar: View {
    let recaudado: Int64        // centavos
    let presupuestado: Int64    // centavos
    let period: String          // "YYYY-MM"

    private var fraction: Double {
        guard presupuestado > 0 else { return 0 }
        return min(1.0, Double(recaudado) / Double(presupuestado))
    }

    private var barColor: Color {
        switch fraction {
        case 0.8...:  return .brandSecondary
        case 0.6..<0.8: return .yellow
        default:      return .red
        }
    }

    // Uses Array+safe subscript from conectia/Extensions/Array+Safe.swift
    private var periodLabel: String {
        let parts = period.split(separator: "-")
        guard parts.count == 2,
              let year = parts.first,
              let month = Int(parts[1])
        else { return period }
        let formatter = DateFormatter()
        let monthName = formatter.monthSymbols[safe: month - 1] ?? period
        return "\(monthName) \(year)"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Recaudo — \(periodLabel)")
                    .font(.subheadline.weight(.semibold))
                Spacer()
                Text("\(Int(fraction * 100))%")
                    .font(.subheadline.weight(.bold))
                    .foregroundColor(barColor)
            }

            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color.gray.opacity(0.15))
                        .frame(height: 10)

                    Capsule()
                        .fill(barColor)
                        .frame(width: geo.size.width * fraction, height: 10)
                        .animation(.easeInOut(duration: 0.6), value: fraction)
                }
            }
            .frame(height: 10)

            HStack {
                Label(formatCOP(centavos: recaudado), systemImage: "checkmark.circle.fill")
                    .font(.caption)
                    .foregroundColor(barColor)
                Spacer()
                Text("de \(formatCOP(centavos: presupuestado))")
                    .font(.caption)
                    .foregroundColor(.textBody)
            }
        }
        .padding()
        .softCardStyle()
    }
}

#Preview {
    VStack(spacing: 16) {
        RecaudoProgressBar(recaudado: 2_400_000_00, presupuestado: 3_000_000_00, period: "2026-03")
        RecaudoProgressBar(recaudado: 1_500_000_00, presupuestado: 3_000_000_00, period: "2026-03")
        RecaudoProgressBar(recaudado: 800_000_00, presupuestado: 3_000_000_00, period: "2026-03")
    }
    .padding()
}
```

- [ ] **Step 3: Create HealthScoreBadge.swift**

Create `conectia/Financial/Components/HealthScoreBadge.swift`:

```swift
import SwiftUI

/// Circular score badge showing the building's financial health (0–100).
/// Ring color: green ≥80, yellow 60–79, red <60.
/// Matches the formula: (recaudoPct×0.50) + (100−moraPct×10)×0.30 + conciliacionScore×0.20
struct HealthScoreBadge: View {
    let score: Int      // 0–100
    let color: String   // "green" | "yellow" | "red"
    let label: String   // e.g. "Excelente"

    private var swiftColor: Color {
        switch color {
        case "green":  return .brandSecondary
        case "yellow": return .yellow
        default:       return .red
        }
    }

    private var fraction: Double {
        Double(max(0, min(100, score))) / 100.0
    }

    var body: some View {
        VStack(spacing: 8) {
            ZStack {
                Circle()
                    .stroke(Color.gray.opacity(0.15), lineWidth: 10)
                    .frame(width: 80, height: 80)

                Circle()
                    .trim(from: 0, to: fraction)
                    .stroke(
                        swiftColor,
                        style: StrokeStyle(lineWidth: 10, lineCap: .round)
                    )
                    .frame(width: 80, height: 80)
                    .rotationEffect(.degrees(-90))
                    .animation(.easeInOut(duration: 0.8), value: fraction)

                Text("\(score)")
                    .font(.system(.title2, design: .rounded).weight(.bold))
                    .foregroundColor(swiftColor)
            }

            Text(label)
                .font(.caption.weight(.medium))
                .foregroundColor(.textBody)
        }
    }
}

#Preview {
    HStack(spacing: 24) {
        HealthScoreBadge(score: 87, color: "green", label: "Excelente")
        HealthScoreBadge(score: 65, color: "yellow", label: "Regular")
        HealthScoreBadge(score: 42, color: "red", label: "Crítico")
    }
    .padding()
}
```

- [ ] **Step 4: Add all three files to Xcode**

In Xcode: create `conectia/Financial/Components` group → Add Files → add `FinancialKpiCard.swift`, `RecaudoProgressBar.swift`, `HealthScoreBadge.swift`. Target: `conectia` for all.

- [ ] **Step 5: Build — expect no errors**

`Cmd+B`. Expected: build succeeds.

- [ ] **Step 6: Verify Xcode Previews**

Open each file → click "Resume" on the Canvas preview:
- `FinancialKpiCard.swift` → shows 4 cards in a 2×2 grid
- `RecaudoProgressBar.swift` → shows 3 bars at different fill levels (green, yellow, red)
- `HealthScoreBadge.swift` → shows 3 rings (green 87, yellow 65, red 42)

- [ ] **Step 7: Commit**

```bash
git add conectia/Financial/Components/FinancialKpiCard.swift \
        conectia/Financial/Components/RecaudoProgressBar.swift \
        conectia/Financial/Components/HealthScoreBadge.swift
git commit -m "feat(ios): add FinancialKpiCard, RecaudoProgressBar, HealthScoreBadge components"
```

---

### Task 7: Remaining Components (MiniTrendChart, DelinquentRow, AlertBanner)

**Files:**
- Create: `conectia/Financial/Components/MiniTrendChart.swift`
- Create: `conectia/Financial/Components/DelinquentRow.swift`
- Create: `conectia/Financial/Components/AlertBanner.swift`

- [ ] **Step 1: Create MiniTrendChart.swift**

Create `conectia/Financial/Components/MiniTrendChart.swift`:

```swift
import SwiftUI
import Charts

/// Grouped bar chart showing the last N months of recaudo vs presupuesto.
/// Uses Swift Charts (iOS 16+). Grouped bars: green (recaudado) + gray (presupuestado).
struct MiniTrendChart: View {
    let points: [TrendPoint]

    // Show at most 6 months to keep the chart readable on iPhone
    private var displayPoints: [TrendPoint] {
        Array(points.suffix(6))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Tendencia Recaudo")
                .font(.subheadline.weight(.semibold))

            if displayPoints.isEmpty {
                emptyState
            } else {
                Chart {
                    ForEach(displayPoints) { point in
                        BarMark(
                            x: .value("Mes", point.shortLabel),
                            y: .value("Recaudado", Double(point.recaudadoCentavos) / 100)
                        )
                        .foregroundStyle(Color.brandSecondary)
                        .cornerRadius(4)

                        BarMark(
                            x: .value("Mes", point.shortLabel),
                            y: .value("Presupuestado", Double(point.presupuestadoCentavos) / 100)
                        )
                        .foregroundStyle(Color.gray.opacity(0.3))
                        .cornerRadius(4)
                    }
                }
                .chartYAxis {
                    AxisMarks { value in
                        AxisValueLabel {
                            if let v = value.as(Double.self) {
                                Text(compactCOP(v))
                                    .font(.caption2)
                            }
                        }
                        AxisGridLine()
                    }
                }
                .chartXAxis {
                    AxisMarks { AxisValueLabel() }
                }
                .frame(height: 140)

                HStack(spacing: 16) {
                    legendDot(color: .brandSecondary, label: "Recaudado")
                    legendDot(color: .gray.opacity(0.5), label: "Presupuestado")
                }
            }
        }
        .padding()
        .softCardStyle()
    }

    private var emptyState: some View {
        Text("Sin datos de tendencia")
            .font(.caption)
            .foregroundColor(.textBody)
            .frame(maxWidth: .infinity, alignment: .center)
            .frame(height: 100)
    }

    private func legendDot(color: Color, label: String) -> some View {
        HStack(spacing: 4) {
            Circle()
                .fill(color)
                .frame(width: 8, height: 8)
            Text(label)
                .font(.caption2)
                .foregroundColor(.textBody)
        }
    }

    /// Compact COP format: "2.4M", "600K", etc.
    private func compactCOP(_ pesos: Double) -> String {
        switch pesos {
        case 1_000_000...: return String(format: "%.1fM", pesos / 1_000_000)
        case 1_000...:     return String(format: "%.0fK", pesos / 1_000)
        default:           return String(format: "%.0f", pesos)
        }
    }
}

#Preview {
    MiniTrendChart(points: [
        TrendPoint(month: "2025-10", recaudado: "200000000", presupuestado: "300000000"),
        TrendPoint(month: "2025-11", recaudado: "260000000", presupuestado: "300000000"),
        TrendPoint(month: "2025-12", recaudado: "290000000", presupuestado: "300000000"),
        TrendPoint(month: "2026-01", recaudado: "180000000", presupuestado: "300000000"),
        TrendPoint(month: "2026-02", recaudado: "310000000", presupuestado: "300000000"),
        TrendPoint(month: "2026-03", recaudado: "250000000", presupuestado: "300000000"),
    ])
    .padding()
}
```

- [ ] **Step 2: Create DelinquentRow.swift**

Create `conectia/Financial/Components/DelinquentRow.swift`:

```swift
import SwiftUI

/// A row representing one delinquent unit in the top-3 delinquency list.
/// Shows unit number, owner name, months overdue (badge), and amount due.
struct DelinquentRow: View {
    let unit: DelinquentUnit

    private var monthsBadgeColor: Color {
        unit.isCritical ? .red : .orange
    }

    private var monthsLabel: String {
        unit.monthsDelinquent >= 3
            ? "3+ meses"
            : "\(unit.monthsDelinquent) \(unit.monthsDelinquent == 1 ? "mes" : "meses")"
    }

    var body: some View {
        HStack(spacing: 12) {
            // Unit badge
            ZStack {
                RoundedRectangle(cornerRadius: 8)
                    .fill(monthsBadgeColor.opacity(0.12))
                    .frame(width: 44, height: 44)
                Text(unit.unitNumber)
                    .font(.system(.callout, design: .rounded).weight(.bold))
                    .foregroundColor(monthsBadgeColor)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(unit.ownerName)
                    .font(.subheadline.weight(.medium))
                    .lineLimit(1)

                HStack(spacing: 6) {
                    Text(monthsLabel)
                        .font(.caption2.weight(.semibold))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(monthsBadgeColor.opacity(0.15))
                        .foregroundColor(monthsBadgeColor)
                        .cornerRadius(4)

                    Text("en mora")
                        .font(.caption2)
                        .foregroundColor(.textBody)
                }
            }

            Spacer()

            Text(formatCOP(centavos: unit.amountDueCentavos))
                .font(.system(.subheadline, design: .rounded).weight(.bold))
                .foregroundColor(.red)
        }
        .padding(.vertical, 6)
    }
}

#Preview {
    List {
        DelinquentRow(unit: DelinquentUnit(id: "1", unitNumber: "301", ownerName: "Carlos López", monthsDelinquent: 3, amountDue: "450000"))
        DelinquentRow(unit: DelinquentUnit(id: "2", unitNumber: "102", ownerName: "María García", monthsDelinquent: 2, amountDue: "300000"))
        DelinquentRow(unit: DelinquentUnit(id: "3", unitNumber: "205", ownerName: "Juan Pérez", monthsDelinquent: 1, amountDue: "150000"))
    }
}
```

- [ ] **Step 3: Create AlertBanner.swift**

Create `conectia/Financial/Components/AlertBanner.swift`:

```swift
import SwiftUI

/// A compact alert banner for financial alerts (mora_critica, vencimiento_proximo, etc.)
/// Severity drives the color: critical = red, warning = orange, info = blue.
struct AlertBanner: View {
    let alert: DashboardAlert

    private var bannerColor: Color {
        switch alert.alertSeverity {
        case .critical: return .red
        case .warning:  return .orange
        case .info:     return .blue
        }
    }

    private var iconName: String {
        switch alert.alertSeverity {
        case .critical: return "exclamationmark.triangle.fill"
        case .warning:  return "clock.badge.exclamationmark.fill"
        case .info:     return "info.circle.fill"
        }
    }

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: iconName)
                .foregroundColor(bannerColor)
                .font(.subheadline)

            Text(alert.message)
                .font(.caption)
                .foregroundColor(.primary)
                .lineLimit(2)

            Spacer()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(bannerColor.opacity(0.08))
        .cornerRadius(10)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(bannerColor.opacity(0.25), lineWidth: 1)
        )
    }
}

#Preview {
    VStack(spacing: 8) {
        AlertBanner(alert: DashboardAlert(id: "1", type: "mora_critica", message: "3 unidades llevan más de 3 meses sin pagar", severity: "critical", unitId: nil, createdAt: ""))
        AlertBanner(alert: DashboardAlert(id: "2", type: "vencimiento_proximo", message: "5 cuotas vencen en los próximos 7 días", severity: "warning", unitId: nil, createdAt: ""))
        AlertBanner(alert: DashboardAlert(id: "3", type: "conciliacion_pendiente", message: "2 pagos requieren conciliación", severity: "info", unitId: nil, createdAt: ""))
    }
    .padding()
}
```

- [ ] **Step 4: Add all three files to Xcode**

In Xcode: `conectia/Financial/Components` → Add Files → `MiniTrendChart.swift`, `DelinquentRow.swift`, `AlertBanner.swift`. Target: `conectia`.

- [ ] **Step 5: Build and verify previews**

`Cmd+B`. Then open each file and verify:
- `MiniTrendChart` → grouped bars render, legend shows
- `DelinquentRow` → 3 rows with different badge colors
- `AlertBanner` → 3 banners: red, orange, blue

- [ ] **Step 6: Commit**

```bash
git add conectia/Financial/Components/MiniTrendChart.swift \
        conectia/Financial/Components/DelinquentRow.swift \
        conectia/Financial/Components/AlertBanner.swift
git commit -m "feat(ios): add MiniTrendChart, DelinquentRow, AlertBanner components"
```

---

### Task 8: AdminFinancialHomeView (Hybrid A+B)

**Files:**
- Create: `conectia/Financial/AdminFinancialHomeView.swift`

- [ ] **Step 1: Create AdminFinancialHomeView.swift**

Create `conectia/Financial/AdminFinancialHomeView.swift`:

```swift
import SwiftUI

/// The admin's financial home screen — Hybrid A+B layout.
///
/// Section A (financial prominence):
///   - Health Score badge + Recaudo progress bar (side by side)
///   - 2×2 KPI grid (Recaudado, Pendiente, Mora %, Conciliación)
///   - Alerts (up to 3, collapsible)
///   - 6-month trend chart
///   - Top 3 delinquent units
///
/// Section B (compact operations):
///   - Quick actions: Nueva Cobro, Ver Cartera, Exportar
///
/// Data source: DashboardViewModel → DashboardRepository → Express API
/// NOT Firestore — all financial data comes from the PostgreSQL backend.
/// Tenant context is derived server-side from the Firebase JWT; no buildingId needed.
struct AdminFinancialHomeView: View {
    @StateObject private var vm = DashboardViewModel()
    @State private var showAllAlerts = false

    var body: some View {
        NavigationStack {
            Group {
                if vm.isLoading && vm.summary == nil {
                    loadingView
                } else if let errorMessage = vm.error, vm.summary == nil {
                    errorView(message: errorMessage)
                } else if vm.summary == nil {
                    // Load completed successfully but no data (no period seeded yet)
                    emptyDataView
                } else {
                    contentView
                }
            }
            .navigationTitle("Finanzas")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    if vm.isLoading {
                        ProgressView().scaleEffect(0.8)
                    } else {
                        Button { Task { await vm.load() } } label: {
                            Image(systemName: "arrow.clockwise")
                        }
                    }
                }
            }
        }
        .task { await vm.load() }
        .refreshable { await vm.load() }
    }

    // MARK: - Content View

    private var contentView: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                // ── SECTION A: Financial ─────────────────────────────────────────
                sectionAFinancial
                    .padding(.bottom, 8)

                // Section divider
                sectionDivider

                // ── SECTION B: Operations (compact) ─────────────────────────────
                sectionBOperations
                    .padding(.top, 8)
            }
        }
        .background(Color.backgroundBase)
    }

    // MARK: - Section A: Financial

    private var sectionAFinancial: some View {
        VStack(spacing: 16) {
            // Row 1: Health score + Progress bar
            if let summary = vm.summary {
                HStack(alignment: .top, spacing: 12) {
                    HealthScoreBadge(
                        score: summary.healthScore.score,
                        color: summary.healthScore.color,
                        label: summary.healthScore.label
                    )
                    .frame(width: 100)

                    RecaudoProgressBar(
                        recaudado: summary.recaudadoCentavos,
                        presupuestado: summary.presupuestadoCentavos,
                        period: summary.period
                    )
                }
                .padding(.horizontal)

                // Row 2: 2×2 KPI grid
                kpiGrid(summary: summary)
                    .padding(.horizontal)
            }

            // Row 3: Alerts (up to 3, or all if expanded)
            if !vm.alerts.isEmpty {
                alertsSection
                    .padding(.horizontal)
            }

            // Row 4: Trend chart
            if !vm.trend.isEmpty {
                MiniTrendChart(points: vm.trend)
                    .padding(.horizontal)
            }

            // Row 5: Top 3 delinquent
            if !vm.topDelinquent.isEmpty {
                delinquentSection
                    .padding(.horizontal)
            }
        }
        .padding(.top, 16)
    }

    private func kpiGrid(summary: DashboardSummaryResponse) -> some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            FinancialKpiCard(
                title: "Recaudado",
                value: formatCOP(centavos: summary.recaudadoCentavos),
                subtitle: "de \(formatCOP(centavos: summary.presupuestadoCentavos))",
                accentColor: .brandSecondary,
                icon: "arrow.up.circle.fill"
            )
            FinancialKpiCard(
                title: "Por cobrar",
                value: formatCOP(centavos: summary.pendingAmountCentavos),
                subtitle: "\(summary.pendingCount) cuotas pendientes",
                accentColor: .orange,
                icon: "clock.fill"
            )
            FinancialKpiCard(
                title: "Mora",
                value: String(format: "%.1f%%", summary.moraPct),
                subtitle: "del total presupuestado",
                accentColor: summary.moraPct > 20 ? .red : .orange,
                icon: "exclamationmark.triangle.fill"
            )
            FinancialKpiCard(
                title: "Conciliación",
                value: "\(summary.conciliacionPendingCount)",
                subtitle: "pagos por conciliar",
                accentColor: summary.conciliacionPendingCount > 0 ? .yellow : .brandSecondary,
                icon: "doc.badge.clock"
            )
        }
    }

    private var alertsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Alertas")
                    .font(.subheadline.weight(.semibold))
                Spacer()
                if vm.alerts.count > 3 {
                    Button(showAllAlerts ? "Ver menos" : "Ver todas (\(vm.alerts.count))") {
                        withAnimation { showAllAlerts.toggle() }
                    }
                    .font(.caption)
                    .foregroundColor(.brandPrimary)
                }
            }

            ForEach(showAllAlerts ? vm.alerts : Array(vm.alerts.prefix(3))) { alert in
                AlertBanner(alert: alert)
            }
        }
    }

    private var delinquentSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Top Morosos")
                    .font(.subheadline.weight(.semibold))
                Spacer()
                NavigationLink("Ver cartera") {
                    Text("Cartera completa — Coming in Phase 1")
                        .foregroundColor(.secondary)
                }
                .font(.caption)
                .foregroundColor(.brandPrimary)
            }

            VStack(spacing: 0) {
                ForEach(vm.topDelinquent) { unit in
                    DelinquentRow(unit: unit)
                    if unit.id != vm.topDelinquent.last?.id {
                        Divider()
                    }
                }
            }
            .padding(.horizontal, 12)
            .softCardStyle()
        }
    }

    // MARK: - Section Divider

    private var sectionDivider: some View {
        VStack(spacing: 0) {
            Color.gray.opacity(0.08)
                .frame(height: 8)
            HStack {
                Text("Operaciones")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(.textBody)
                    .padding(.horizontal)
                    .padding(.vertical, 6)
                Spacer()
            }
            .background(Color.gray.opacity(0.04))
        }
    }

    // MARK: - Section B: Operations (compact)

    private var sectionBOperations: some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                quickActionButton(
                    title: "Nueva Cobro",
                    icon: "plus.circle.fill",
                    color: .brandPrimary
                ) {
                    // TODO: Navigate to new charge form
                }

                quickActionButton(
                    title: "Ver Cartera",
                    icon: "list.bullet.rectangle.fill",
                    color: .orange
                ) {
                    // TODO: Navigate to Cartera full view
                }

                quickActionButton(
                    title: "Exportar",
                    icon: "square.and.arrow.up.fill",
                    color: .brandSecondary
                ) {
                    // TODO: Show export sheet
                }
            }
            .padding(.horizontal)
        }
        .padding(.vertical, 12)
    }

    private func quickActionButton(title: String, icon: String, color: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.title3)
                    .foregroundColor(color)
                Text(title)
                    .font(.caption2.weight(.medium))
                    .foregroundColor(.primary)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(color.opacity(0.08))
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(color.opacity(0.2), lineWidth: 1)
            )
        }
    }

    // MARK: - Loading / Error / Empty States

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.2)
            Text("Cargando datos financieros…")
                .font(.subheadline)
                .foregroundColor(.textBody)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.backgroundBase)
    }

    private func errorView(message: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.largeTitle)
                .foregroundColor(.orange)
            Text("No se pudo cargar")
                .font(.headline)
            Text(message)
                .font(.subheadline)
                .foregroundColor(.textBody)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
            Button("Reintentar") {
                Task { await vm.load() }
            }
            .juicyButtonStyle()
            .padding(.horizontal, 40)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.backgroundBase)
    }

    /// Shown when the API returned successfully but no period data exists yet.
    /// This happens before the first billing period is seeded in the backend.
    private var emptyDataView: some View {
        VStack(spacing: 16) {
            Image(systemName: "chart.bar.xaxis")
                .font(.system(size: 48))
                .foregroundColor(.brandPrimary.opacity(0.4))
            Text("Sin datos financieros")
                .font(.headline)
            Text("Todavía no hay períodos de cobro registrados para este edificio.")
                .font(.subheadline)
                .foregroundColor(.textBody)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 32)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.backgroundBase)
    }
}

#Preview {
    AdminFinancialHomeView()
        .environmentObject(SessionManager())
}
```

- [ ] **Step 2: Add to Xcode**

In Xcode: `conectia/Financial` → Add Files → `AdminFinancialHomeView.swift`. Target: `conectia`.

- [ ] **Step 3: Build — expect no errors**

`Cmd+B`. Expected: build succeeds (preview will show loading state since there's no mock data, that's OK).

- [ ] **Step 4: Commit**

```bash
git add conectia/Financial/AdminFinancialHomeView.swift
git commit -m "feat(ios): add AdminFinancialHomeView with hybrid A+B layout"
```

---

## Chunk 3: Integration — AdminTabView + BuildingFinancialsView + Smoke Test

### Task 9: Update AdminTabView

**Files:**
- Modify: `conectia/AdminTabView.swift`

- [ ] **Step 1: Read current AdminTabView**

Open `conectia/AdminTabView.swift`. Current tabs: Tickets, Edificios, Unidades, Usuarios, Amenities, Reservas, Avisos (7 tabs). No financial tab.

- [ ] **Step 2: Add Finanzas as first tab**

In `AdminTabView.swift`, replace the `TabView` body:

> **Environment note:** `AdminTabView` is instantiated by `RootView`, which injects `SessionManager` via `.environmentObject(sessionManager)`. Adding `@EnvironmentObject private var session: SessionManager` to `AdminTabView` is safe — SwiftUI propagates the same instance down the hierarchy. All child views (AdminTicketsView, AdminBuildingsView, etc.) that also declare `@EnvironmentObject var session: SessionManager` will receive the same inherited instance.

```swift
struct AdminTabView: View {
    // Inherited from RootView via .environmentObject(sessionManager)
    @EnvironmentObject private var session: SessionManager

    var body: some View {
        TabView {
            // FINANZAS — first tab, financial prominence (Plan C)
            // AdminFinancialHomeView creates its own DashboardViewModel internally.
            // Tenant context is derived from the Firebase JWT — no buildingId needed here.
            NavigationStack {
                AdminFinancialHomeView()
            }
            .tabItem { Label("Finanzas", systemImage: "chart.bar.fill") }

            NavigationStack {
                AdminTicketsView()
            }
            .tabItem { Label("Tickets", systemImage: "tray.full.fill") }

            NavigationStack {
                AdminBuildingsView()
            }
            .tabItem { Label("Edificios", systemImage: "building.2.fill") }

            NavigationStack {
                AdminUnitsView()
            }
            .tabItem { Label("Unidades", systemImage: "square.grid.2x2.fill") }

            NavigationStack {
                AdminUsersView()
            }
            .tabItem { Label("Usuarios", systemImage: "person.3.fill") }

            NavigationStack {
                AdminAmenitiesView()
            }
            .tabItem { Label("Amenities", systemImage: "sportscourt.fill") }

            NavigationStack {
                AdminReservationsView()
            }
            .tabItem { Label("Reservas", systemImage: "calendar.badge.clock") }

            NavigationStack {
                AdminAnnouncementsView()
            }
            .tabItem { Label("Avisos", systemImage: "megaphone.fill") }
        }
        .tint(.brandPrimary)
    }
}
```

> **Note:** `.tint(.purple)` → `.tint(.brandPrimary)` to align with the design system. `.brandPrimary` is defined in `DesignSystem.swift`.

- [ ] **Step 3: Build — expect no errors**

`Cmd+B`. Expected: build succeeds.

- [ ] **Step 4: Run on simulator**

`Cmd+R` on iPhone 16 Pro simulator. Log in as admin → should see "Finanzas" tab first with loading spinner → then error state (backend not running in simulator, that's expected). Verify:
- Finanzas tab appears first
- Loading state shows correctly
- Error state shows with "Reintentar" button

- [ ] **Step 5: Commit**

```bash
git add conectia/AdminTabView.swift
git commit -m "feat(ios): add Finanzas tab as first admin tab, wire to AdminFinancialHomeView"
```

---

### Task 10: Retire BuildingFinancialsView

**Files:**
- Modify: `conectia/BuildingFinancialsView.swift`

`BuildingFinancialsView` is currently orphaned (not linked from any navigation or tab). It contains hardcoded mock data. We keep the file for now but replace its body with a redirect to `AdminFinancialHomeView` — if it's ever navigated to, it shows real data.

- [ ] **Step 1: Update BuildingFinancialsView**

Open `conectia/BuildingFinancialsView.swift`. Replace the entire `BuildingFinancialsView` struct body:

```swift
import SwiftUI

/// Deprecated standalone financial view — now delegates to AdminFinancialHomeView.
/// All financial data comes from the Express API, not hardcoded mocks.
/// Tenant context is derived from the Firebase JWT; no buildingId needed.
struct BuildingFinancialsView: View {
    var body: some View {
        AdminFinancialHomeView()
    }
}
```

> Keep `ChartCard` in a separate file or delete it entirely since it's now unused. Check if `ChartCard` is referenced anywhere else first.

- [ ] **Step 2: Check ChartCard references**

In Xcode: `Find → Find in Project` → search `ChartCard`. If zero results (other than `BuildingFinancialsView.swift` itself), delete `ChartCard` from the file. If used elsewhere, leave it.

- [ ] **Step 3: Build — expect no errors**

`Cmd+B`. Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add conectia/BuildingFinancialsView.swift
git commit -m "refactor(ios): replace hardcoded BuildingFinancialsView with AdminFinancialHomeView delegate"
```

---

### Task 11: Add API_BASE_URL to Info.plist

**Files:**
- Modify: `conectia/Info.plist` (or `conectia.xcodeproj` build settings)

The `APIClient` reads `API_BASE_URL` from `Bundle.main.infoDictionary`. This must be configured per environment.

- [ ] **Step 1: Add API_BASE_URL to Build Settings**

In Xcode:
1. Select the `conectia` project in the Navigator → select the `conectia` target → Build Settings tab
2. Click `+` → "Add User-Defined Setting"
3. Name it `API_BASE_URL`
4. Set value for `Debug`: `http://localhost:3000`
5. Set value for `Release`: `http://localhost:3000` (update to production URL when backend is deployed; can be overridden by CI/CD via `xcodebuild API_BASE_URL=https://api.conectia.co`)

- [ ] **Step 2: Wire the setting into Info.plist**

Open `conectia/Info.plist` (right-click → Open As → Source Code). Add this entry inside the root `<dict>`:

```xml
<key>API_BASE_URL</key>
<string>$(API_BASE_URL)</string>
```

At build time Xcode substitutes `$(API_BASE_URL)` with the value from Build Settings. `Bundle.main.infoDictionary?["API_BASE_URL"]` then returns the correct string at runtime.

- [ ] **Step 3: Verify the setting is read**

In `APIClient.swift`, the production `init()` reads:
```swift
let rawURL = Bundle.main.infoDictionary?["API_BASE_URL"] as? String
    ?? "http://localhost:3000"
```
The fallback `?? "http://localhost:3000"` is a safety net only — if the build setting is wired correctly, it should never be needed.

- [ ] **Step 3: Build Debug scheme**

`Cmd+B` with Debug scheme. Expected: no warnings about missing key (fallback handles it).

- [ ] **Step 4: Commit**

```bash
git add conectia/Info.plist
git commit -m "feat(ios): add API_BASE_URL build setting for configurable backend URL"
```

---

### Task 12: End-to-End Smoke Test (Simulator + Local Backend)

> This task verifies the full stack works: iOS → Express API → PostgreSQL. It requires the backend to be running locally from Plan A.

- [ ] **Step 1: Start the backend**

```bash
cd backend
npm run dev
# Expected: "🚀 Server running on port 3000"
```

- [ ] **Step 2: Create a test admin user with buildingId**

Use the existing seed data or create via the API:
```bash
# Seed the test admin (if not already done)
# Ensure Firestore has an admin user with buildingId set to a building
# that has charges and periods seeded in PostgreSQL from Plan A migrations
```

- [ ] **Step 3: Launch iOS app in simulator**

`Cmd+R` on iPhone 16 Pro. Log in with test admin credentials.

- [ ] **Step 4: Verify Finanzas tab**

- "Finanzas" tab is first and selected by default
- Loading spinner appears briefly
- If backend running + seeded data: KPI cards populate, health score ring animates, progress bar fills
- If no seed data: empty states show cleanly (no crash, no stale mock data)

- [ ] **Step 5: Verify pull-to-refresh**

Pull down on Finanzas scroll view → loading indicator → data refreshes.

- [ ] **Step 6: Verify error state**

Stop the backend (`Ctrl+C`). Pull to refresh → error state shows with message "Error del servidor" → tap "Reintentar" → error persists (expected, backend down).

- [ ] **Step 7: Final commit**

```bash
git add .
git commit -m "feat(ios): complete iOS financial home — hybrid A+B layout consuming Express API"
```

---

## Post-Implementation Checklist

After all chunks are complete, verify:

- [ ] All `conectiaTests` pass: `Cmd+U` → green
- [ ] Build succeeds for Debug and Release schemes
- [ ] Finanzas tab is first in AdminTabView
- [ ] Loading state shows on first load
- [ ] Error state shows when backend unreachable
- [ ] Pull-to-refresh works
- [ ] Health score ring animates on load
- [ ] Progress bar fills with animation
- [ ] Top 3 delinquent units shown on home
- [ ] Trend chart renders bars for last 6 months
- [ ] Quick actions row visible in Section B
- [ ] No financial data fetched from Firestore — all from Express API
- [ ] `ChartCard` stub with hardcoded data is gone from production code

## Dependencies

- **Plan A must be executed first** — the Express API endpoints must exist before the iOS app can call them:
  - `GET /api/v1/dashboard/summary`
  - `GET /api/v1/dashboard/trend?months=N`
  - `GET /api/v1/dashboard/alerts`
  - `GET /api/v1/charges/delinquent`
- **Firebase Auth** must be configured in `GoogleService-Info.plist` (already present in existing app)
- **Info.plist** `API_BASE_URL` must point to a running backend instance

## Known Limitations (Phase 2)

- Quick action buttons ("Nueva Cobro", "Ver Cartera", "Exportar") are stubs — navigation wired in Phase 2
- No Wompi/PSE payment flow on iOS yet (Phase 1 web-only)
- `CarteraDetailView` (full delinquency list) and `ConciliacionView` are web-only in Phase 1
