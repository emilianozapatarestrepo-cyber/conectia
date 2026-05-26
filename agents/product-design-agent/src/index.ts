import * as readline from "node:readline";
import { stdin, stdout } from "node:process";
import type Anthropic from "@anthropic-ai/sdk";
import { runAgentTurn } from "./agent.js";

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

function printBanner(): void {
  console.log("");
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  CODI — Diseño de Producto & Investigación de Mercado    ║");
  console.log("║  Especialista en Conectia · Copropiedades Colombia        ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log("");
  console.log("Hola! Soy CODI, tu asistente de producto para Conectia.");
  console.log("Puedo ayudarte con:");
  console.log("  • Investigación de mercado de proptech en Colombia");
  console.log("  • Creación de personas de usuario");
  console.log("  • Priorización de funcionalidades (RICE)");
  console.log("  • Diseño de encuestas de validación");
  console.log("  • Análisis competitivo");
  console.log("");
  console.log('Escribe "salir" para terminar la sesión.');
  console.log("");
}

async function main(): Promise<void> {
  const messages: Anthropic.MessageParam[] = [];

  const rl = readline.createInterface({ input: stdin, output: stdout });

  process.on("SIGINT", () => {
    console.log("\n\n¡Hasta luego! Recuerda: construir el producto correcto para el mercado correcto.");
    rl.close();
    process.exit(0);
  });

  printBanner();

  while (true) {
    const userInput = await prompt(rl, "Tú: ");
    const trimmed = userInput.trim();

    if (!trimmed) continue;

    if (trimmed.toLowerCase() === "salir" || trimmed.toLowerCase() === "exit") {
      console.log("\n¡Hasta luego! Recuerda: construir el producto correcto para el mercado correcto.");
      rl.close();
      break;
    }

    messages.push({ role: "user", content: trimmed });

    console.log("\nCODI: ");

    try {
      const response = await runAgentTurn(messages);
      console.log(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\n❌ Error: ${message}`);
      // Remove the failed user message so conversation stays consistent
      messages.pop();
    }

    console.log("");
  }
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
