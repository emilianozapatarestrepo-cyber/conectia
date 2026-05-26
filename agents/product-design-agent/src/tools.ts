import Anthropic from "@anthropic-ai/sdk";

export const WEB_SEARCH_TOOL = {
  type: "web_search_20260209" as const,
  name: "web_search" as const,
};

export const CUSTOM_TOOLS: Anthropic.Tool[] = [
  {
    name: "crear_persona_usuario",
    description:
      "Crea y documenta una persona de usuario estructurada para Conectia. " +
      "Úsalo cuando necesites definir un arquetipo de usuario concreto para guiar decisiones de producto, " +
      "diseño de features o estrategia de go-to-market en el mercado colombiano de copropiedades.",
    input_schema: {
      type: "object" as const,
      properties: {
        nombre_persona: {
          type: "string",
          description: "Nombre ficticio representativo (ej: 'Carlos el Administrador')",
        },
        rol: {
          type: "string",
          enum: [
            "administrador",
            "residente_propietario",
            "residente_arrendatario",
            "personal_operativo",
            "consejo_directivo",
          ],
          description: "Rol dentro de la copropiedad",
        },
        edad_rango: {
          type: "string",
          description: "Rango de edad (ej: '35-50 años')",
        },
        perfil_profesional: {
          type: "string",
          description: "Ocupación y nivel educativo",
        },
        necesidades_principales: {
          type: "array",
          items: { type: "string" },
          description: "Lista de 3-5 necesidades clave en su rol",
          minItems: 1,
        },
        puntos_de_dolor: {
          type: "array",
          items: { type: "string" },
          description: "Frustraciones actuales con la gestión de la copropiedad",
          minItems: 1,
        },
        objetivos_con_conectia: {
          type: "array",
          items: { type: "string" },
          description: "Qué espera lograr usando Conectia",
          minItems: 1,
        },
        comportamiento_tecnologico: {
          type: "string",
          enum: ["experto_digital", "usuario_intermedio", "usuario_basico"],
          description: "Nivel de adopción tecnológica",
        },
        cita_representativa: {
          type: "string",
          description: "Frase que resume su perspectiva en primera persona",
        },
      },
      required: [
        "nombre_persona",
        "rol",
        "necesidades_principales",
        "puntos_de_dolor",
        "objetivos_con_conectia",
      ],
      additionalProperties: false,
    },
  },
  {
    name: "priorizar_funcionalidades",
    description:
      "Prioriza funcionalidades usando el framework RICE (Reach × Impact × Confidence / Effort). " +
      "Genera un ranking ordenado con puntuación RICE y recomendaciones de roadmap. " +
      "Úsalo cuando debas decidir qué construir primero con recursos limitados.",
    input_schema: {
      type: "object" as const,
      properties: {
        contexto: {
          type: "string",
          description:
            "Contexto del ejercicio de priorización (ej: 'Q3 2026 - equipo de 2 devs')",
        },
        funcionalidades: {
          type: "array",
          items: {
            type: "object",
            properties: {
              nombre: {
                type: "string",
                description: "Nombre corto de la funcionalidad",
              },
              descripcion: {
                type: "string",
                description: "Descripción breve de qué hace y para quién",
              },
              reach: {
                type: "number",
                description:
                  "Número de usuarios impactados por mes (usuarios concretos, no porcentaje)",
                minimum: 0,
              },
              impacto: {
                type: "number",
                enum: [0.25, 0.5, 1, 2, 3],
                description:
                  "Nivel de impacto: 0.25=mínimo, 0.5=bajo, 1=medio, 2=alto, 3=masivo",
              },
              confianza: {
                type: "number",
                description:
                  "Porcentaje de confianza en las estimaciones de reach e impacto (0-100)",
                minimum: 0,
                maximum: 100,
              },
              esfuerzo_semanas: {
                type: "number",
                description: "Semanas-persona estimadas para implementar",
                minimum: 0.1,
              },
            },
            required: [
              "nombre",
              "descripcion",
              "reach",
              "impacto",
              "confianza",
              "esfuerzo_semanas",
            ],
            additionalProperties: false,
          },
          minItems: 2,
          description: "Lista de funcionalidades a priorizar (mínimo 2)",
        },
      },
      required: ["funcionalidades"],
      additionalProperties: false,
    },
  },
  {
    name: "disenar_encuesta",
    description:
      "Diseña una encuesta de investigación de mercado o validación de producto para Conectia. " +
      "Genera preguntas estructuradas con mix de NPS, Likert y preguntas abiertas. " +
      "Incluye notas metodológicas y guía de distribución adaptada al contexto colombiano.",
    input_schema: {
      type: "object" as const,
      properties: {
        objetivo: {
          type: "string",
          description:
            "Qué se quiere aprender o validar con la encuesta (hipótesis específica)",
        },
        audiencia: {
          type: "string",
          enum: [
            "administradores_conjuntos",
            "residentes_propietarios",
            "consejo_directivo",
            "potenciales_clientes_b2b",
            "mixta",
          ],
          description: "Segmento objetivo de la encuesta",
        },
        hipotesis: {
          type: "array",
          items: { type: "string" },
          description:
            "Lista de hipótesis a validar (ej: 'Los administradores dedican >4h/semana a conciliación manual')",
          minItems: 1,
        },
        canal: {
          type: "string",
          enum: [
            "formulario_digital",
            "entrevista_presencial",
            "entrevista_remota",
            "encuesta_in_app",
          ],
          description: "Canal de distribución de la encuesta",
        },
        max_preguntas: {
          type: "number",
          description: "Número máximo de preguntas en la encuesta",
          minimum: 3,
          maximum: 20,
        },
      },
      required: ["objetivo", "audiencia", "hipotesis"],
      additionalProperties: false,
    },
  },
  {
    name: "analizar_competidor",
    description:
      "Genera un análisis estructurado de un competidor en el mercado de gestión de copropiedades. " +
      "Produce perfil competitivo con fortalezas, debilidades y ventajas diferenciadas de Conectia. " +
      "Úsalo para inteligencia competitiva y posicionamiento estratégico.",
    input_schema: {
      type: "object" as const,
      properties: {
        nombre: {
          type: "string",
          description: "Nombre del competidor o solución",
        },
        tipo: {
          type: "string",
          enum: [
            "directo",
            "indirecto",
            "sustituto_digital",
            "sustituto_manual",
          ],
          description:
            "Tipo de competencia: directo=mismo segmento, indirecto=problema similar, sustituto=alternativa actual",
        },
        mercados: {
          type: "array",
          items: { type: "string" },
          description:
            "Países o regiones donde opera (ej: ['Colombia', 'México'])",
        },
        segmento: {
          type: "string",
          description:
            "Segmento de mercado objetivo (ej: 'Grandes conjuntos +200 unidades')",
        },
        fortalezas: {
          type: "array",
          items: { type: "string" },
          description: "Ventajas competitivas identificadas",
          minItems: 1,
        },
        debilidades: {
          type: "array",
          items: { type: "string" },
          description: "Debilidades o gaps identificados",
          minItems: 1,
        },
        precios: {
          type: "string",
          description: "Modelo y rango de precios conocido",
        },
        ventajas_conectia: {
          type: "array",
          items: { type: "string" },
          description: "Por qué Conectia es mejor o diferente para este segmento",
          minItems: 1,
        },
      },
      required: ["nombre", "tipo", "fortalezas", "debilidades", "ventajas_conectia"],
      additionalProperties: false,
    },
  },
];

type AnyRecord = Record<string, unknown>;

function handleCrearPersona(input: AnyRecord): string {
  const nombre = String(input.nombre_persona ?? "Sin nombre");
  const rol = String(input.rol ?? "");
  const edad = input.edad_rango ? String(input.edad_rango) : null;
  const perfil = input.perfil_profesional ? String(input.perfil_profesional) : null;
  const necesidades = (input.necesidades_principales as string[]) ?? [];
  const dolores = (input.puntos_de_dolor as string[]) ?? [];
  const objetivos = (input.objetivos_con_conectia as string[]) ?? [];
  const tech = input.comportamiento_tecnologico
    ? String(input.comportamiento_tecnologico).replace(/_/g, " ")
    : null;
  const cita = input.cita_representativa ? String(input.cita_representativa) : null;

  const rolLabels: Record<string, string> = {
    administrador: "Administrador de Copropiedad",
    residente_propietario: "Residente Propietario",
    residente_arrendatario: "Residente Arrendatario",
    personal_operativo: "Personal Operativo",
    consejo_directivo: "Consejo Directivo",
  };

  const lines: string[] = [
    `## 👤 Persona: ${nombre}`,
    `**Rol:** ${rolLabels[rol] ?? rol}`,
  ];

  if (edad) lines.push(`**Edad:** ${edad}`);
  if (perfil) lines.push(`**Perfil profesional:** ${perfil}`);
  if (tech) lines.push(`**Comportamiento tecnológico:** ${tech}`);

  if (cita) {
    lines.push("", `> *"${cita}"*`);
  }

  lines.push("", "### Necesidades principales");
  necesidades.forEach((n) => lines.push(`- ${n}`));

  lines.push("", "### Puntos de dolor");
  dolores.forEach((d) => lines.push(`- ${d}`));

  lines.push("", "### Objetivos con Conectia");
  objetivos.forEach((o) => lines.push(`- ${o}`));

  lines.push(
    "",
    "---",
    "_Persona generada por CODI · Conectia Product Design Agent_"
  );

  return lines.join("\n");
}

function handlePriorizarFuncionalidades(input: AnyRecord): string {
  const contexto = input.contexto ? String(input.contexto) : null;
  const items = (
    input.funcionalidades as Array<{
      nombre: string;
      descripcion: string;
      reach: number;
      impacto: number;
      confianza: number;
      esfuerzo_semanas: number;
    }>
  ).map((f) => ({
    ...f,
    rice: (f.reach * f.impacto * (f.confianza / 100)) / f.esfuerzo_semanas,
  }));

  items.sort((a, b) => b.rice - a.rice);

  const lines: string[] = ["## Priorización RICE de Funcionalidades"];

  if (contexto) lines.push(`**Contexto:** ${contexto}`, "");

  lines.push(
    "| Rank | Funcionalidad | Reach | Impacto | Confianza | Esfuerzo | RICE Score |",
    "| ---- | ------------- | ----- | ------- | --------- | -------- | ---------- |"
  );

  items.forEach((f, i) => {
    lines.push(
      `| #${i + 1} | **${f.nombre}** | ${f.reach} | ${f.impacto} | ${f.confianza}% | ${f.esfuerzo_semanas}w | **${f.rice.toFixed(1)}** |`
    );
  });

  lines.push("", "### Recomendaciones de Roadmap");

  if (items.length > 0) {
    lines.push(`**🏆 Alta prioridad (hacer ahora):** ${items[0].nombre}`);
    lines.push(`   _${items[0].descripcion}_`);
  }
  if (items.length > 1) {
    lines.push(`**📋 Media prioridad (próximo sprint):** ${items[1].nombre}`);
    lines.push(`   _${items[1].descripcion}_`);
  }
  if (items.length > 2) {
    lines.push(`**🔜 Backlog priorizado:** ${items.slice(2).map((f) => f.nombre).join(", ")}`);
  }

  lines.push(
    "",
    "> **Fórmula RICE:** (Reach × Impacto × Confianza%) / Esfuerzo",
    "_Análisis generado por CODI · Conectia Product Design Agent_"
  );

  return lines.join("\n");
}

function handleDisenarEncuesta(input: AnyRecord): string {
  const objetivo = String(input.objetivo ?? "");
  const audiencia = String(input.audiencia ?? "").replace(/_/g, " ");
  const hipotesis = (input.hipotesis as string[]) ?? [];
  const canal = input.canal ? String(input.canal).replace(/_/g, " ") : "formulario digital";
  const maxPreguntas = (input.max_preguntas as number) ?? 12;

  const canalNotes: Record<string, string> = {
    "formulario digital": "Google Forms / Typeform — comparte por WhatsApp Business y grupos de administradores",
    "entrevista presencial": "Agenda 45-60 min en el conjunto — lleva tablet para mostrar Conectia en vivo",
    "entrevista remota": "Google Meet / Teams — graba con permiso, transcribe con IA",
    "encuesta in app": "Muestra en sesión activa 3-5 días después del onboarding",
  };

  const lines: string[] = [
    `## Encuesta: ${objetivo}`,
    "",
    `**Audiencia:** ${audiencia}`,
    `**Canal:** ${canal}`,
    `**Distribución:** ${canalNotes[canal] ?? canal}`,
    `**Límite de preguntas:** ${maxPreguntas}`,
    "",
    "---",
    "",
    "### Bloque 1 — Contextualización (2 preguntas)",
    "",
    "**P1.** ¿Cuál es tu rol principal en la copropiedad?",
    "_(Selección única: Administrador / Residente propietario / Consejo directivo / Otro)_",
    "",
    "**P2.** ¿Cuántas unidades residenciales tiene tu conjunto?",
    "_(Selección única: Menos de 50 / 50-150 / 151-300 / Más de 300)_",
    "",
    "---",
    "",
    "### Bloque 2 — Hipótesis a validar",
    "",
  ];

  let questionNum = 3;

  hipotesis.forEach((h, i) => {
    if (questionNum > maxPreguntas - 2) return;

    lines.push(`**Hipótesis ${i + 1}:** _${h}_`, "");

    lines.push(
      `**P${questionNum}.** En una escala del 1 al 5, ¿qué tan frecuentemente enfrentas esta situación?`,
      "_(1 = Nunca · 3 = A veces · 5 = Siempre)_",
      ""
    );
    questionNum++;

    if (questionNum <= maxPreguntas - 2) {
      lines.push(
        `**P${questionNum}.** ¿Cuánto tiempo dedicas a esto por semana?`,
        "_(Selección única: Menos de 1h / 1-3h / 3-5h / Más de 5h / No aplica)_",
        ""
      );
      questionNum++;
    }
  });

  lines.push("---", "", "### Bloque 3 — Validación de valor Conectia");

  if (questionNum <= maxPreguntas - 1) {
    lines.push(
      "",
      `**P${questionNum}.** Si Conectia automatizara este proceso, ¿cuánto valor le daría?`,
      "_(1 = Ningún valor · 5 = Crítico para mí)_",
      ""
    );
    questionNum++;
  }

  lines.push("---", "", "### Bloque 4 — NPS y cierre");

  if (questionNum <= maxPreguntas) {
    lines.push(
      "",
      `**P${questionNum}.** ¿Qué tan probable es que recomiendes Conectia a otro administrador? (0-10)`,
      "_(Net Promoter Score — 0 = Nada probable · 10 = Muy probable)_",
      ""
    );
    questionNum++;
  }

  if (questionNum <= maxPreguntas) {
    lines.push(
      `**P${questionNum}.** ¿Qué es lo más importante que mejorarías en Conectia hoy?`,
      "_(Respuesta abierta — máximo 3 líneas)_",
      ""
    );
  }

  lines.push(
    "---",
    "",
    "### Notas metodológicas",
    "",
    `- **Muestra mínima:** 30 respuestas para validación estadística básica`,
    `- **Tiempo de respuesta:** 5-8 minutos estimados`,
    `- **Incentivo sugerido:** Acceso anticipado a nueva feature o descuento mes`,
    `- **Análisis:** Correlaciona Likert con NPS; las preguntas abiertas dan los insights cualitativos`,
    "",
    "_Encuesta generada por CODI · Conectia Product Design Agent_"
  );

  return lines.join("\n");
}

function handleAnalizarCompetidor(input: AnyRecord): string {
  const nombre = String(input.nombre ?? "");
  const tipo = String(input.tipo ?? "").replace(/_/g, " ");
  const mercados = (input.mercados as string[]) ?? [];
  const segmento = input.segmento ? String(input.segmento) : null;
  const fortalezas = (input.fortalezas as string[]) ?? [];
  const debilidades = (input.debilidades as string[]) ?? [];
  const precios = input.precios ? String(input.precios) : null;
  const ventajas = (input.ventajas_conectia as string[]) ?? [];

  const tipoEmoji: Record<string, string> = {
    directo: "⚔️",
    indirecto: "↔️",
    "sustituto digital": "💻",
    "sustituto manual": "📋",
  };

  const lines: string[] = [
    `## ${tipoEmoji[tipo] ?? "🔍"} Análisis Competitivo: ${nombre}`,
    "",
    `**Tipo de competencia:** ${tipo}`,
  ];

  if (mercados.length > 0) {
    lines.push(`**Mercados:** ${mercados.join(", ")}`);
  }
  if (segmento) lines.push(`**Segmento objetivo:** ${segmento}`);
  if (precios) lines.push(`**Modelo de precios:** ${precios}`);

  lines.push("", "### Fortalezas");
  fortalezas.forEach((f) => lines.push(`- ✅ ${f}`));

  lines.push("", "### Debilidades / Gaps");
  debilidades.forEach((d) => lines.push(`- ❌ ${d}`));

  lines.push("", "### Ventajas de Conectia vs este competidor");
  ventajas.forEach((v) => lines.push(`- 🚀 ${v}`));

  lines.push(
    "",
    "### Implicaciones estratégicas para Conectia",
    "",
    `Al competir con **${nombre}**, Conectia debe enfatizar sus ventajas diferenciales en:`,
    ...ventajas.slice(0, 2).map((v) => `- ${v}`),
    "",
    "_Análisis generado por CODI · Conectia Product Design Agent_"
  );

  return lines.join("\n");
}

export function executeCustomTool(name: string, input: unknown): string {
  const inp = input as AnyRecord;
  switch (name) {
    case "crear_persona_usuario":
      return handleCrearPersona(inp);
    case "priorizar_funcionalidades":
      return handlePriorizarFuncionalidades(inp);
    case "disenar_encuesta":
      return handleDisenarEncuesta(inp);
    case "analizar_competidor":
      return handleAnalizarCompetidor(inp);
    default:
      return `⚠️ Herramienta desconocida: ${name}`;
  }
}
