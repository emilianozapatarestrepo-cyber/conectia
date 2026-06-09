# Conectia — Análisis de Mercado y Estrategia de Producto

> Memo interno · Junio 2026 · Basado en investigación competitiva de 40+ productos en 8 países
> (EE.UU., Canadá, Brasil, México, Colombia, Chile, Argentina, Europa)

---

## 1. El mercado

| Métrica | Dato | Fuente |
|---|---|---|
| Mercado global software HOA | USD $9.5B (2023) → $18B (2032), 7.1% CAGR | Market research 2024 |
| Mercado software inmobiliario Colombia | USD $47.4M (2024), **12.5% CAGR** | Cognitive Market Research |
| Población colombiana en propiedad horizontal | **>60%** (vs 20% hace 30 años) | DANE / Portafolio |
| Vivienda nueva que es apartamento | 86% de lo construido en 6 años | Camacol |
| Morosidad en conjuntos colombianos | **60–80%** según estrato | Portafolio |
| Crecimiento proptech con IA vs sin IA | 42% vs 24% anualizado | 2025 |

**Tesis:** Colombia es el mercado de propiedad horizontal más fragmentado y menos penetrado
de LatAm. No hay un ganador dominante (a diferencia de Brasil con Superlógica al 50% del
mercado). La ventana está abierta — pero se está cerrando: ComunidadFeliz (Chile) entró en
agosto 2025 con USD $3M y meta de 5,000 comunidades; Properix (Argentina) entró con respaldo
de Manu Ginóbili.

## 2. Mapa competitivo en Colombia

| Competidor | Fortaleza | Debilidad explotable |
|---|---|---|
| **Vecindapp** (líder, 800+ conjuntos) | Asambleas legales, citofonía virtual, PSE | Contabilidad débil, sin ledger auditable, quejas de notificaciones iOS |
| **SIPHO** | Compliance DIAN más profundo, AI "Iris" | Caro, enfocado en administradores profesionales grandes |
| **Munily** (YC-backed) | Seguridad/accesos, marketplace | Contabilidad superficial, foco Panamá |
| **Propiedata** | Asambleas virtuales (líder) | COP $1.99M/año — caro para conjuntos pequeños |
| **Proplogica** | Precio bajo ($49.900/mes), WhatsApp-native | Producto poco profundo, sin pasarela de pagos integrada |
| **ComunidadFeliz** (entrante) | Capital, IA, experiencia 8 países | Sin adaptación local completa (PSE/Nequi en progreso), sin Ley 675 nativo |
| **Properix** (entrante) | Escala (500K viviendas en AR) | Producto argentino, sin DIAN ni PSE nativos aún |

**Posicionamiento de Conectia:** *El único software de propiedad horizontal en Colombia
construido fintech-first* — ledger de doble partida con hash chain anti-fraude, conciliación
automática Wompi, y recaudo con link de pago directo. Nadie más tiene contabilidad auditable
de grado bancario. El 25% de las quejas de residentes en Bogotá son por administradores
deshonestos → **la transparencia financiera verificable es nuestro cuña (wedge)**.

## 3. Señales de demanda (qué piden los usuarios, rankeado)

Datos de 6,774 interacciones de compra (Software Advice) + reviews G2/Capterra + encuestas CAI:

1. **Contabilidad + pagos en línea** — 81% lo considera crítico, 60% lo pide explícitamente. ✅ *Conectia lo tiene y es nuestro diferencial.*
2. **Portal residente** — 86% crítico. PERO: solo 19% de residentes usa los portales actuales (UX mala). 79% quiere autoservicio digital. ⚠️ *Conectia: solo página de pago pública.*
3. **Comunicaciones** — el factor de cambio de software #3. En LatAm **WhatsApp es EL canal** (98% open rate vs 20% email). Vecindapp, Neivor, Superlógica y Proplogica ya son WhatsApp-first. ❌ *Conectia: solo links de mora.*
4. **Reservas de amenidades** — el driver #1 de adopción del portal residente (beneficio personal inmediato). ✅ *Sprint 9.*
5. **PQRS / violaciones** — obligatorio legal en Colombia (Ley 675). ✅ *Sprint 8.*
6. **Asambleas digitales con quórum por coeficiente** — diferencial legal colombiano. ⚠️ *Parcial (modo presentación).*
7. **Morosidad** — el dolor #1 del administrador colombiano (60–80%). ✅ *Fuerte: página dedicada + links WhatsApp.* Oportunidad futura: el modelo "Inadimplência Zero" de Superlógica (absorber riesgo de cartera) no existe en Colombia.

### Razones por las que los clientes ABANDONAN un software (deal-breakers)
1. Precios ocultos (costo real 30–50% sobre lo anunciado) → **publicar precios transparentes**
2. Soporte que colapsa después de la venta → ventaja estructural para un equipo pequeño y cercano
3. Complejidad para juntas no técnicas → mantener la UX simple es estrategia, no estética
4. Software de rentas disfrazado de software de PH → Conectia es PH-nativo

## 4. Roadmap demanda-primero

| Sprint | Feature | Justificación de demanda |
|---|---|---|
| ~~8~~ | ~~PQRS~~ | ✅ Obligatorio Ley 675 |
| ~~9~~ | ~~Reservas zonas comunes~~ | ✅ Driver #1 de adopción residente |
| **10** | **Comunicados WhatsApp-first con segmentación** | Canal #1 LatAm; feature #3 global; gap directo vs Vecindapp/Proplogica |
| 11 | Portal residente (estado de cuenta + historial + PQRS self-service) | 79% lo quiere; transparencia = nuestra cuña anti-fraude |
| 12 | Asambleas con quórum por coeficiente + votación | Diferencial legal CO; líder actual (Propiedata) es caro |
| 13 | Nequi/Daviplata + facturación electrónica DIAN | Gap de TODO el mercado: nadie cubre Nequi/Daviplata bien |
| 14 | IA: predicción de morosidad + asistente de cartera | 42% CAGR en proptech-IA; Vantaca ahorra 750h/mes con esto |

## 5. Por qué podemos ganar (resumen YC)

- **Mercado:** grande, creciendo 12.5%, sin ganador local, con dolor agudo (morosidad 60-80%).
- **Cuña:** contabilidad auditable + recaudo integrado. Los competidores hacen "comunicación con contabilidad pegada"; nosotros hacemos "fintech con comunidad encima".
- **Timing:** Decreto 768/2025 + RUAPH crean presión regulatoria nueva que el software legacy no cubre.
- **Distribución:** el link de pago por WhatsApp es viral por diseño — cada residente que paga ve el producto.
- **Modelo:** SaaS por unidad + take rate sobre recaudo (como Superlógica, que se volvió institución financiera).
