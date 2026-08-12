# Cadence — Adaptive Daily Planning

> **Your day, shaped by how you actually feel.**

Most planners treat every Monday the same. Cadence adapts your schedule to how you actually feel today — based on sleep debt, energy levels, menstrual cycle phase, and accumulated feedback. In the public no-login demo, plans and ratings stay in the visitor's browser.

**Live demo:** [cadence-planner-zeta.vercel.app](https://cadence-planner-zeta.vercel.app/)

---

## The Problem

Every productivity tool on the market assumes humans are constants. They schedule your deep work at 9 AM whether you slept eight hours or four. They ignore that your cognitive capacity fluctuates with your hormonal cycle, your training load, and your accumulated sleep debt.

The research is clear:

- Chronic sleep restriction below 6 hours produces cognitive deficits equivalent to 2 nights of total sleep deprivation (Van Dongen et al., 2003)
- Circadian phenotype determines individual peak performance windows — "larks" and "owls" differ by up to 6 hours (Facer-Childs & Brandstaetter, 2015)
- Luteal phase progesterone elevation affects working memory and emotional processing (Sundström-Poromaa & Gingnell, 2014)
- Recovery-load balance is essential for sustained performance (Kellmann et al., 2018)

Yet no planner accounts for any of this. Cadence does.

---

## Who It Helps

| Persona | Context | How Cadence adapts |
|---|---|---|
| **Working Mom** | Slept 4 hrs, luteal phase, kid was sick | Pushes deep work to afternoon, adds recovery blocks, reduces task intensity |
| **Startup Founder** | Slept 7 hrs, high energy, morning person | Front-loads hardest tasks (investor deck at 8:30 AM), schedules workout midday |
| **Student** | Slept 3 hrs, menstrual phase, exam stress | Limits to 2-3 essential tasks, maximises rest, places study in personal peak window |

Same task list. Radically different schedules. Because the planner adapts to the person, not the calendar.

---

## How It Works

```
User inputs state (sleep, energy, clarity, cycle phase)
        ↓
Few-shot examples from research papers ground the LLM
        ↓
OpenAI generates an adapted schedule + rationale
        ↓
ElevenLabs narrates WHY the day is shaped this way
        ↓
Browser-local storage saves the plan and ratings
        ↓
Recent ratings guide later plans on the same device
```

### The Adaptive Loop

1. **Day 1:** User generates a plan. The browser saves it locally.
2. **Day 2:** User gives positive or negative feedback. The same browser remembers it.
3. **Day 3:** Same state → different plan. Deep work moved to 2 PM. The system adapted.

Over time, the "What I know about you" panel builds a device-local profile: average sleep, preferred deep-work windows, and cycle patterns. Clearing browser storage clears this profile.

### Portfolio Demo Privacy

- No account or login is required.
- Plans, tasks, cycle information, and feedback are stored only in browser `localStorage`.
- The morning brief is a preview; the demo does not send email.
- Paid AI routes apply request and input-size limits. Hosting-level rate limiting and provider spending caps are still recommended for a production deployment.
- The Convex storage prototype is retained as internal-only code for a future authenticated version; it is not used by the public demo.

---

## Research Grounding via Adaption Labs

We did not just prompt an LLM with generic instructions. We ingested 6 academic papers into **Adaption Labs'** unstructured document pipeline to generate a structured training dataset.

### Papers Processed

| Topic | Paper |
|---|---|
| Adaptive interventions framework | Nahum-Shani et al. (2018) — *JITAIs in Mobile Health* |
| Sleep debt & cognition | Van Dongen et al. (2003) — *Cumulative Cost of Additional Wakefulness* |
| Chronotype & performance | Roenneberg et al. (2003) — *Life between Clocks* |
| Menstrual cycle & cognition | Sundström-Poromaa & Gingnell (2014) — *Menstrual Cycle Influence on Cognitive Function* |
| Training load & recovery | Halson (2014) — *Monitoring Training Load to Understand Fatigue* |
| N-of-1 personalisation | Hekler et al. (2019) — *Why We Need a Small Data Paradigm* |

The adapted JSONL output is included in this repository at [`/data/adaption-labs-output.jsonl`](/data/adaption-labs-output.jsonl). This dataset was used to construct the few-shot examples that ground the planner's recommendations in peer-reviewed science.

---

## Tech Stack

| Layer | Tool | Purpose |
|---|---|---|
| Frontend | Next.js + Tailwind + shadcn/ui | Responsive UI with persona cards, sliders, timeline |
| Demo State | Browser localStorage | Private no-login plan history and persisted feedback |
| Backend Prototype | Convex | Internal-only storage prototype for a future authenticated version |
| Planning Engine | OpenAI | Generates adaptive schedules with structured JSON output |
| Research Grounding | Adaption Labs | Processed academic papers into training data |
| Voice | ElevenLabs | Text-to-speech narration of daily rationale |
| Build Tool | Cursor | App developed with agent-assisted engineering workflows |
| Hosting | Vercel | One-click deployment with environment variables |
| Strategy | Manus | Product architecture, sponsor analysis, demo scripting |

---

## Running Locally

```bash
# Clone
git clone https://github.com/chochan25/cadence-planner.git
cd cadence-planner

# Install
npm install

# Set up environment
cp .env.example .env.local
# Fill in: OPENAI_API_KEY and ELEVENLABS_API_KEY

# Start Next.js
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Sponsor Tracks

The original hackathon prototype targeted these sponsor tracks:

- **Adaption Labs** — Most creative use of Adaptive Data (paper ingestion → training dataset → grounded planner)
- **Convex** — Original persistence prototype; public portfolio storage is now local until authentication is added
- **Cursor** — Agent-assisted product and engineering workflow
- **OpenAI** — Best use of OpenAI (few-shot research-grounded planning with structured JSON output)
- **ElevenLabs** — Voice rationale feature

---

## Project Structure

```
cadence-planner/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── plan/route.ts        # OpenAI planning endpoint
│   │   │   ├── speak/route.ts       # ElevenLabs TTS endpoint
│   │   │   └── export-calendar/     # .ics calendar export
│   │   └── page.tsx                 # Main UI
│   ├── hooks/
│   │   └── use-local-plans.ts       # Private browser persistence
│   ├── data/
│   │   └── few-shot-examples.ts     # Research-grounded examples
│   └── lib/                          # Validation, duration, rate-limit helpers
├── convex/
│   ├── schema.ts                    # Database schema
│   └── plans.ts                     # Internal-only storage prototype
├── data/
│   └── adaption-labs-output.jsonl   # Raw Adaption Labs output
└── public/
```

---

## Builder

**Cho Chan Myei Oo** — AI Product Manager, Manchester UK
- GitHub: [@chochan25](https://github.com/chochan25)
- LinkedIn: [chochanmyei](https://linkedin.com/in/chochanmyei)

Built solo at the AI Engineer Hackathon, Singapore (May 2026).

---

## License

MIT
