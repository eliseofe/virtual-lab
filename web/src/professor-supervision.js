import { createClient } from "https://esm.sh/@supabase/supabase-js@2.111.0";

const SUPABASE_URL = "https://izdmmudfrmqhvlgepwes.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_MKaLNxnqvYbJUyik9zN7WA_r4ie2P5d";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { storageKey: "vlab-production-registry-auth-v1" },
});

const professorPanel = document.querySelector(".professor-panel");
const professorNote = professorPanel?.querySelector(".professor-panel-note");

if (!professorPanel || !professorNote) {
  throw new Error("Professor supervision requires the Professor panel.");
}

let profile = null;
let studentProfiles = [];
let studentExperiments = [];

function installStyles() {
  if (document.querySelector("style[data-vlab-professor-supervision]")) return;
  const style = document.createElement("style");
  style.dataset.vlabProfessorSupervision = "";
  style.textContent = `
    .professor-supervision[hidden] { display: none !important; }
    .professor-supervision-open { width: 100%; min-height: 34px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .professor-supervision-count { display: inline-flex; align-items: center; justify-content: center; min-width: 24px; min-height: 22px; padding: 2px 7px; border-radius: 999px; background: #edf4f6; color: #315a69; font-size: 10.5px; font-weight: 750; }
    .professor-supervision { width: min(860px, calc(100vw - 28px)); max-height: min(760px, calc(100vh - 28px)); border: 0; border-radius: 16px; padding: 0; box-shadow: 0 18px 70px rgba(16,35,44,.28); color: #172127; }
    .professor-supervision::backdrop { background: rgba(16,27,33,.42); }
    .professor-supervision-shell { display: grid; grid-template-rows: auto auto 1fr; max-height: inherit; min-height: 480px; background: #fff; }
    .professor-supervision-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 17px 18px 12px; border-bottom: 1px solid #e6ecef; }
    .professor-supervision-head h2 { margin: 0; font-size: 17px; }
    .professor-supervision-actions { display: flex; gap: 7px; }
    .professor-supervision-summary { margin: 0; padding: 11px 18px; color: #64757c; font-size: 11.5px; line-height: 1.4; border-bottom: 1px solid #eef2f4; }
    .professor-supervision-message { margin: 0; padding: 10px 18px 0; min-height: 1.4em; color: #64757c; font-size: 11px; }
    .professor-supervision-message[data-state="error"] { color: #9e2d29; }
    .professor-supervision-list { display: grid; align-content: start; gap: 10px; overflow: auto; padding: 10px 18px 18px; }
    .professor-supervision-empty { margin: 8px 2px; color: #718087; font-size: 12px; }
    .professor-student-experiment { display: grid; gap: 5px; width: 100%; padding: 11px 12px; text-align: left; border: 1px solid #dfe7ea; border-radius: 11px; background: #fff; }
    .professor-student-experiment:hover { background: #f6f9fa; }
    .professor-student-experiment strong { font-size: 12.5px; color: #172127; }
    .professor-student-experiment-meta { color: #6d7d84; font-size: 10.5px; line-height: 1.4; }
    @media (max-width: 680px) {
      .professor-supervision-shell { min-height: min(620px, calc(100vh - 28px)); }
      .professor-supervision-open,
      .professor-supervision-actions button,
      .professor-student-experiment { min-height: 44px; }
    }
  `;
  document.head.append(style);
}

function buildUi() {
  const open = document.createElement("button");
  open.className = "professor-supervision-open";
  const label = document.createElement("span");
  label.textContent = "Student experiments";
  const count = document.createElement("span");
  count.className = "professor-supervision-count";
  count.textContent = "0";
  open.append(label, count);
  professorPanel.insertBefore(open, professorNote);

  const dialog = document.createElement("dialog");
  dialog.className = "professor-supervision";
  dialog.setAttribute("aria-label", "Student experiments");
  const shell = document.createElement("div");
  shell.className = "professor-supervision-shell";
  const head = document.createElement("div");
  head.className = "professor-supervision-head";
  const heading = document.createElement("h2");
  heading.textContent = "Student experiments";
  const actions = document.createElement("div");
  actions.className = "professor-supervision-actions";
  const refresh = document.createElement("button");
  refresh.textContent = "Refresh";
  const close = document.createElement("button");
  close.textContent = "Close";
  actions.append(refresh, close);
  head.append(heading, actions);

  const summary = document.createElement("p");
  summary.className = "professor-supervision-summary";
  summary.textContent = "Research supervision view. Student Experiments are read-only: inspect and run them without changing the student's canonical work.";
  const message = document.createElement("p");
  message.className = "professor-supervision-message";
  message.setAttribute("role", "status");
  const list = document.createElement("div");
  list.className = "professor-supervision-list";
  shell.append(head, summary, message, list);
  dialog.append(shell);
  document.body.append(dialog);
  return { open, count, dialog, refresh, close, message, list };
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function studentName(ownerId) {
  return studentProfiles.find((student) => student.id === ownerId)?.display_name?.trim() || "Student researcher";
}

function setMessage(text, state = "idle") {
  ui.message.textContent = text;
  ui.message.dataset.state = state;
}

function openExperiment(experiment) {
  window.dispatchEvent(new CustomEvent("vlab:open-supervised-experiment", { detail: { id: experiment.id } }));
  if (ui.dialog.open) ui.dialog.close();
  const utilities = document.querySelector("#workspace-utilities");
  if (utilities?.open) utilities.close();
}

function render() {
  ui.count.textContent = String(studentExperiments.length);
  ui.count.setAttribute("aria-label", `${studentExperiments.length} student experiment${studentExperiments.length === 1 ? "" : "s"}`);
  ui.list.replaceChildren();

  if (studentExperiments.length === 0) {
    const empty = document.createElement("p");
    empty.className = "professor-supervision-empty";
    empty.textContent = "No active student Experiments yet.";
    ui.list.append(empty);
    return;
  }

  for (const experiment of studentExperiments) {
    const item = document.createElement("button");
    item.className = "professor-student-experiment";
    item.type = "button";
    const title = document.createElement("strong");
    title.textContent = experiment.title;
    const meta = document.createElement("span");
    meta.className = "professor-student-experiment-meta";
    const updated = formatDate(experiment.updated_at);
    meta.textContent = `${studentName(experiment.owner_id)} · revision ${experiment.revision}${updated ? ` · updated ${updated}` : ""} · Read-only`;
    item.append(title, meta);
    item.addEventListener("click", () => openExperiment(experiment));
    ui.list.append(item);
  }
}

async function loadStudentExperiments() {
  if (profile?.role !== "professor") {
    studentProfiles = [];
    studentExperiments = [];
    render();
    return;
  }

  ui.refresh.disabled = true;
  setMessage("Loading student Experiments…");
  try {
    const { data: students, error: studentsError } = await supabase
      .from("profiles")
      .select("id, display_name, role")
      .eq("role", "student")
      .order("display_name", { ascending: true });
    if (studentsError) throw studentsError;
    studentProfiles = students ?? [];

    if (studentProfiles.length === 0) {
      studentExperiments = [];
      render();
      setMessage("No student researchers are registered.");
      return;
    }

    const { data: experiments, error: experimentsError } = await supabase
      .from("experiments")
      .select("id, owner_id, title, revision, updated_at")
      .in("owner_id", studentProfiles.map((student) => student.id))
      .eq("lifecycle", "active")
      .order("updated_at", { ascending: false });
    if (experimentsError) throw experimentsError;
    studentExperiments = experiments ?? [];
    render();
    setMessage(`${studentExperiments.length} active student Experiment${studentExperiments.length === 1 ? "" : "s"}.`);
  } catch (error) {
    setMessage(error instanceof Error ? error.message : String(error), "error");
    throw error;
  } finally {
    ui.refresh.disabled = false;
  }
}

async function syncSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const user = data.session?.user ?? null;
  profile = null;
  studentProfiles = [];
  studentExperiments = [];

  if (!user) {
    ui.open.hidden = true;
    if (ui.dialog.open) ui.dialog.close();
    render();
    return;
  }

  const { data: nextProfile, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name, role")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  profile = nextProfile;

  const isProfessor = profile?.role === "professor";
  ui.open.hidden = !isProfessor;
  if (!isProfessor) {
    if (ui.dialog.open) ui.dialog.close();
    render();
    return;
  }

  await loadStudentExperiments();
}

function run(task) {
  Promise.resolve().then(task).catch((error) => {
    console.error("Professor supervision error:", error);
    setMessage(error instanceof Error ? error.message : String(error), "error");
  });
}

installStyles();
const ui = buildUi();
ui.open.hidden = true;
ui.open.addEventListener("click", () => {
  if (profile?.role !== "professor") return;
  run(loadStudentExperiments);
  ui.dialog.showModal();
});
ui.refresh.addEventListener("click", () => run(loadStudentExperiments));
ui.close.addEventListener("click", () => ui.dialog.close());
ui.dialog.addEventListener("click", (event) => {
  if (event.target === ui.dialog) ui.dialog.close();
});

supabase.auth.onAuthStateChange(() => queueMicrotask(() => run(syncSession)));
run(syncSession);
