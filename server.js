const express     = require("express");
const mongoose    = require("mongoose");
const bodyParser  = require("body-parser");
const PDFDocument = require("pdfkit");
const bcrypt      = require("bcryptjs");
const session     = require("express-session");

const Routine = require("./models/Routine");
const User    = require("./models/User");

const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));
app.set("view engine", "ejs");

app.use(session({
  secret: process.env.SESSION_SECRET || "diabetes_secret_key_2024",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

console.log("MONGODB_URI:", process.env.MONGODB_URI ? "SET" : "NOT SET — falling back to localhost");

mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/diabetesDB")
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log(err));

// ── Auth middleware ──
function requireLogin(req, res, next) {
  if (req.session.userId) return next();
  res.redirect("/login");
}

// ── Auth routes ──
app.get("/login", (req, res) => {
  if (req.session.userId) return res.redirect("/");
  res.render("login", { error: null });
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.render("login", { error: "No account found with that email." });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.render("login", { error: "Incorrect password. Please try again." });
    req.session.userId   = user._id;
    req.session.userName = user.name;
    res.redirect("/");
  } catch (err) {
    res.render("login", { error: "Something went wrong. Please try again." });
  }
});

app.get("/signup", (req, res) => {
  if (req.session.userId) return res.redirect("/");
  res.render("signup", { error: null });
});

app.post("/signup", async (req, res) => {
  const { name, email, password, confirm, age } = req.body;
  try {
    if (password !== confirm)
      return res.render("signup", { error: "Passwords do not match." });
    const existing = await User.findOne({ email });
    if (existing)
      return res.render("signup", { error: "An account with this email already exists." });
    const hashed = await bcrypt.hash(password, 10);
    const user   = new User({ name, email, password: hashed, age });
    await user.save();
    req.session.userId   = user._id;
    req.session.userName = user.name;
    res.redirect("/");
  } catch (err) {
    console.error("Signup error:", err.message);
    res.render("signup", { error: "Error: " + err.message });
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// ── Dashboard (home) ──
app.get("/", requireLogin, async (req, res) => {
  const userId   = req.session.userId;
  const userName = req.session.userName;

  // Last 7 routines for chart + recent list
  const recentRoutines = await Routine.find({ userId }).sort({ date: -1 }).limit(7);
  const totalRoutines  = await Routine.countDocuments({ userId });

  // Build 7-day glucose trend (fill missing days with null)
  const today = new Date();
  const chartLabels = [];
  const chartData   = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    chartLabels.push(d.toLocaleDateString("en-US", { weekday: "short" }));
    const dayRecord = recentRoutines.find(r => {
      const rd = new Date(r.date);
      return rd.getDate() === d.getDate() && rd.getMonth() === d.getMonth();
    });
    chartData.push(dayRecord ? dayRecord.glucose : null);
  }

  // Latest routine for today's summary
  const todayRoutine = recentRoutines[0] || null;

  res.render("dashboard_home", {
    userName,
    totalRoutines,
    recentRoutines,
    todayRoutine,
    chartLabels: JSON.stringify(chartLabels),
    chartData:   JSON.stringify(chartData),
    page: "dashboard"
  });
});

// ── My Routines (log form) ──
app.get("/routines", requireLogin, (req, res) => {
  res.render("routines", { userName: req.session.userName, page: "routines" });
});

app.post("/submit", requireLogin, async (req, res) => {
  const { name, age, glucose, breakfast, lunch, dinner, snacks, activity, meditation, stressNote, language } = req.body;
  const routine = new Routine({ name, age, glucose, breakfast, lunch, dinner, snacks, activity, meditation, stressNote, userId: req.session.userId });
  await routine.save();

  let recommendations = [];
  const g = parseFloat(glucose);
  if (g > 180)      recommendations.push({ text: language === "ta" ? "இரத்த சர்க்கரை அதிகமாக உள்ளது" : "Blood glucose is high — consult your doctor",      severity: "High" });
  else if (g < 70)  recommendations.push({ text: language === "ta" ? "இரத்த சர்க்கரை குறைவாக உள்ளது" : "Blood glucose is low — have a snack immediately",    severity: "High" });
  else              recommendations.push({ text: language === "ta" ? "இரத்த சர்க்கரை சாதாரண நிலையில் உள்ளது" : "Blood glucose is within normal range",          severity: "Low"  });

  recommendations.push({ text: language === "ta" ? "காய்கறி மற்றும் நார்ச்சத்து அதிகரிக்கவும்" : "Increase vegetables and fiber intake in meals",              severity: "Medium" });

  if (activity && activity.length > 3) recommendations.push({ text: language === "ta" ? "உடற்பயிற்சி பதிவு செய்யப்பட்டது — நல்லது!"  : "Physical activity recorded — great work!",         severity: "Low"    });
  else                                 recommendations.push({ text: language === "ta" ? "உடற்பயிற்சி குறைவாக உள்ளது"                 : "Low physical activity — try a 30-minute walk",    severity: "Medium" });

  if (meditation && meditation.length > 3) recommendations.push({ text: language === "ta" ? "தியானம் பயிற்சி செய்தீர்கள் — மிக நல்லது!" : "Meditation practiced — excellent!",               severity: "Low"    });
  else                                     recommendations.push({ text: language === "ta" ? "தியானம் செய்ய பரிந்துரைக்கப்படுகிறது"      : "Try 10 minutes of meditation today",               severity: "Medium" });

  if (stressNote && stressNote.length > 20) recommendations.push({ text: language === "ta" ? "மன அழுத்தம் அதிகமாக உள்ளது — ஓய்வு எடுங்கள்" : "Stress level seems high — take adequate rest",  severity: "High"   });

  res.render("dashboard", { routine, recommendations, language, userName: req.session.userName, page: "routines" });
});

// ── Blood Sugar Log ──
app.get("/blood-sugar", requireLogin, async (req, res) => {
  const records = await Routine.find({ userId: req.session.userId }).sort({ date: -1 }).limit(30);
  res.render("blood_sugar", { userName: req.session.userName, records, page: "blood-sugar" });
});

// ── Meals ──
app.get("/meals", requireLogin, async (req, res) => {
  const records = await Routine.find({ userId: req.session.userId, $or: [{ breakfast: { $ne: "" } }, { lunch: { $ne: "" } }, { dinner: { $ne: "" } }] }).sort({ date: -1 }).limit(20);
  res.render("meals", { userName: req.session.userName, records, page: "meals" });
});

// ── Exercise ──
app.get("/exercise", requireLogin, async (req, res) => {
  const records = await Routine.find({ userId: req.session.userId, activity: { $ne: "" } }).sort({ date: -1 }).limit(20);
  res.render("exercise", { userName: req.session.userName, records, page: "exercise" });
});

// ── Medication ──
app.get("/medication", requireLogin, (req, res) => {
  res.render("medication", { userName: req.session.userName, page: "medication" });
});

// ── Reports ──
app.get("/reports", requireLogin, async (req, res) => {
  const records = await Routine.find({ userId: req.session.userId }).sort({ date: -1 });
  res.render("reports", { userName: req.session.userName, records, page: "reports" });
});

// ── Profile ──
app.get("/profile", requireLogin, async (req, res) => {
  const user = await User.findById(req.session.userId);
  res.render("profile", { userName: req.session.userName, user, page: "profile" });
});

// ── PDF download ──
app.get("/download-pdf", requireLogin, async (req, res) => {
  const { name, age } = req.query;
  const records = await Routine.find({ userId: req.session.userId }).sort({ date: -1 }).limit(7);
  const doc = new PDFDocument();
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=diabetes-report.pdf");
  doc.pipe(res);
  doc.fontSize(20).text("Diabetes Health Report", { align: "center" });
  doc.moveDown();
  doc.fontSize(12).text(`Patient: ${name}`);
  doc.text(`Age: ${age}`);
  doc.text(`Generated: ${new Date().toDateString()}`);
  doc.moveDown();
  doc.fontSize(14).text("Recent Records:", { underline: true });
  doc.moveDown(0.5);
  records.forEach(r => {
    doc.fontSize(11).text(`Date: ${new Date(r.date).toDateString()}  |  Glucose: ${r.glucose} mg/dL`);
    doc.text(`  Meals: ${[r.breakfast, r.lunch, r.dinner].filter(Boolean).join(", ") || "—"}`);
    doc.text(`  Activity: ${r.activity || "—"}  |  Meditation: ${r.meditation || "—"}`);
    doc.moveDown(0.3);
  });
  doc.moveDown();
  doc.fontSize(14).text("General Recommendations:", { underline: true });
  doc.fontSize(11).text("• Monitor blood glucose regularly");
  doc.text("• Eat balanced meals with fibre");
  doc.text("• Exercise at least 30 minutes daily");
  doc.text("• Practice meditation to reduce stress");
  doc.text("• Consult your doctor for personalised advice");
  doc.end();
});

// ── Chatbot ──
app.post("/chatbot", requireLogin, (req, res) => {
  const { message, language } = req.body;
  const msg = message.toLowerCase();
  let reply = "";
  if (language === "ta") {
    if (msg.includes("glucose") || msg.includes("சர்க்கரை")) reply = "சாதாரண இரத்த சர்க்கரை அளவு 70 முதல் 140 mg/dL வரை இருக்கும்.";
    else if (msg.includes("உணவு"))                            reply = "நார்ச்சத்து அதிகம் உள்ள உணவுகள் மற்றும் காய்கறிகள் நல்லவை.";
    else if (msg.includes("உடற்பயிற்சி"))                    reply = "தினமும் குறைந்தது 30 நிமிடம் நடைப்பயிற்சி செய்யவும்.";
    else if (msg.includes("தியானம்") || msg.includes("மன"))  reply = "தியானம் மன அழுத்தத்தை குறைத்து சர்க்கரை கட்டுப்பாட்டிற்கு உதவும்.";
    else                                                       reply = "தயவுசெய்து நீரிழிவு தொடர்பான கேள்வியை கேளுங்கள்.";
  } else {
    if (msg.includes("glucose"))                       reply = "Normal blood glucose level ranges between 70 and 140 mg/dL.";
    else if (msg.includes("food") || msg.includes("meal")) reply = "Eat fibre-rich foods, vegetables and avoid excess sugar.";
    else if (msg.includes("exercise"))                 reply = "At least 30 minutes of daily physical activity is recommended.";
    else if (msg.includes("meditation") || msg.includes("stress")) reply = "Meditation helps reduce stress and stabilise glucose levels.";
    else                                               reply = "Please ask a diabetes-related question.";
  }
  res.json({ reply });
});

// ── Records JSON (kept for compatibility) ──
app.get("/records", requireLogin, async (req, res) => {
  const records = await Routine.find({ userId: req.session.userId }).sort({ date: -1 });
  res.json(records);
});

app.listen(process.env.PORT || 3000, () => console.log(`Server running on port ${process.env.PORT || 3000}`));
