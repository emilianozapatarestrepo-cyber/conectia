import SwiftUI

// MARK: - Color Palette
extension Color {
    static let brandPrimary = Color(hex: "4F46E5") // Electric Indigo
    static let brandSecondary = Color(hex: "10B981") // Vibrant Emerald
    static let brandGradientStart = Color(hex: "4F46E5")
    static let brandGradientEnd = Color(hex: "6366F1")
    
    static let textHeading = Color(hex: "111827")
    static let textBody = Color(hex: "6B7280")
    
    static let backgroundBase = Color(hex: "F9FAFB") // Ice Gray
    static let cardBackground = Color.white
}

// MARK: - UI Modifiers

struct SoftCardModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(Color.cardBackground)
            .cornerRadius(20)
            .shadow(color: Color.brandPrimary.opacity(0.06), radius: 15, x: 0, y: 4)
            .overlay(
                RoundedRectangle(cornerRadius: 20)
                    .stroke(Color.gray.opacity(0.1), lineWidth: 1)
            )
    }
}

struct JuicyButtonModifier: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(.headline)
            .foregroundColor(.white)
            .padding()
            .frame(maxWidth: .infinity)
            .background(
                LinearGradient(gradient: Gradient(colors: [.brandGradientStart, .brandGradientEnd]), startPoint: .leading, endPoint: .trailing)
            )
            .cornerRadius(16)
            .shadow(color: Color.brandPrimary.opacity(0.25), radius: 8, x: 0, y: 4)
    }
}

extension View {
    func softCardStyle() -> some View {
        self.modifier(SoftCardModifier())
    }
    
    func juicyButtonStyle() -> some View {
        self.modifier(JuicyButtonModifier())
    }
    
    func roundedFont(_ style: Font.TextStyle, weight: Font.Weight = .regular) -> some View {
        self.font(.system(style, design: .rounded).weight(weight))
    }
}

// MARK: - Hex Helper
extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (1, 1, 1, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}
