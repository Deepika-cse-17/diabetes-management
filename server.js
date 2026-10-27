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

console.log("MONGODB_URI:", process.env.MONGODB_URI ? "SET" : "NOT SET");

mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/diabetesDB")
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

function requireLogin(req, res, next) {
  if (req.session.userId) return next();
  res.redirect("/login");
}

// helper — get lang from session
function lang(req) { return req.session.lang || "en"; }

// ── Language toggle ──
app.post("/set-language", requireLogin, (req, res) => {
  req.session.lang = req.body.lang === "ta" ? "ta" : "en";
  res.json({ ok: true });
});

// ── Auth ──
app.get("/login", (req, res) => {
  if (req.session.userId) return res.redirect("/");
  res.render("login", { error: null });
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.render("login", { error: "No account found with that email." });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.render("login", { error: "Incorrect password. Please try again." });
    req.session.userId   = user._id;
    req.session.userName = user.name;
    res.redirect("/");
  } catch (err) {
    res.render("login", { error: "Something went wrong." });
  }
});

app.get("/signup", (req, res) => {
  if (req.session.userId) return res.redirect("/");
  res.render("signup", { error: null });
});

app.post("/signup", async (req, res) => {
  try {
    const { name, email, password, confirm, age } = req.body;
    if (password !== confirm) return res.render("signup", { error: "Passwords do not match." });
    const existing = await User.findOne({ email });
    if (existing) return res.render("signup", { error: "Email already registered." });
    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hashed, age });
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

// ── Dashboard ──
app.get("/", requireLogin, async (req, res) => {
  try {
    const userId   = req.session.userId;
    const userName = req.session.userName;
    const l        = lang(req);

    const recentRoutines = await Routine.find({ userId }).sort({ date: -1 }).limit(7);
    const totalRoutines  = await Routine.countDocuments({ userId });

    const today = new Date();
    const chartLabels = [];
    const chartData   = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      chartLabels.push(d.toLocaleDateString("en-US", { weekday: "short" }));
      const rec = recentRoutines.find(r => {
        const rd = new Date(r.date);
        return rd.getDate() === d.getDate() && rd.getMonth() === d.getMonth() && rd.getFullYear() === d.getFullYear();
      });
      chartData.push(rec ? rec.glucose : null);
    }

    res.render("dashboard_home", {
      userName, totalRoutines, recentRoutines,
      todayRoutine: recentRoutines[0] || null,
      chartLabels: JSON.stringify(chartLabels),
      chartData:   JSON.stringify(chartData),
      lang: l, page: "dashboard"
    });
  } catch (err) {
    console.error("Dashboard error:", err.message);
    res.status(500).send("Server error: " + err.message);
  }
});

// ── My Routines ──
app.get("/routines", requireLogin, (req, res) => {
  res.render("routines", { userName: req.session.userName, lang: lang(req), page: "routines" });
});

app.post("/submit", requireLogin, async (req, res) => {
  try {
    const { name, age, glucose, breakfast, lunch, dinner, snacks, activity, meditation, stressNote } = req.body;
    const l = lang(req);
    const routine = new Routine({ name, age, glucose, breakfast, lunch, dinner, snacks, activity, meditation, stressNote, userId: req.session.userId });
    await routine.save();

    const g = parseFloat(glucose);
    const recommendations = [];
    if (g > 180)     recommendations.push({ text: l==="ta" ? "இரத்த சர்க்கரை அதிகமாக உள்ளது — மருத்துவரை அணுகவும்"    : "Blood glucose is high — consult your doctor",    severity: "High"   });
    else if (g < 70) recommendations.push({ text: l==="ta" ? "இரத்த சர்க்கரை குறைவாக உள்ளது — உடனே சிற்றுண்டி சாப்பிடவும்" : "Blood glucose is low — have a snack immediately", severity: "High"   });
    else             recommendations.push({ text: l==="ta" ? "இரத்த சர்க்கரை சாதாரண நிலையில் உள்ளது"                   : "Blood glucose is within normal range",            severity: "Low"    });
    recommendations.push({  text: l==="ta" ? "காய்கறி மற்றும் நார்ச்சத்து அதிகரிக்கவும்"                              : "Increase vegetables and fibre intake",            severity: "Medium" });
    if (activity && activity.length > 3) recommendations.push({ text: l==="ta" ? "உடற்பயிற்சி பதிவு செய்யப்பட்டது"    : "Physical activity recorded — great work!",        severity: "Low"    });
    else                                 recommendations.push({ text: l==="ta" ? "உடற்பயிற்சி குறைவாக உள்ளது"          : "Low activity — try a 30-minute walk",             severity: "Medium" });
    if (meditation && meditation.length > 3) recommendations.push({ text: l==="ta" ? "தியானம் பயிற்சி செய்தீர்கள்"    : "Meditation practiced — excellent!",               severity: "Low"    });
    else                                     recommendations.push({ text: l==="ta" ? "தியானம் செய்ய பரிந்துரை"          : "Try 10 minutes of meditation today",              severity: "Medium" });
    if (stressNote && stressNote.length > 20) recommendations.push({ text: l==="ta" ? "மன அழுத்தம் அதிகம் — ஓய்வு எடுங்கள்" : "Stress seems high — take adequate rest",       severity: "High"   });

    res.render("dashboard", { routine, recommendations, lang: l, userName: req.session.userName, page: "routines" });
  } catch (err) {
    console.error("Submit error:", err.message);
    res.status(500).send("Error: " + err.message);
  }
});

// ── Blood Sugar ──
app.get("/blood-sugar", requireLogin, async (req, res) => {
  try {
    const records = await Routine.find({ userId: req.session.userId }).sort({ date: -1 }).limit(30);
    res.render("blood_sugar", { userName: req.session.userName, records, lang: lang(req), page: "blood-sugar" });
  } catch (err) { res.status(500).send("Error: " + err.message); }
});

// ── Meals ──
app.get("/meals", requireLogin, async (req, res) => {
  try {
    const records = await Routine.find({ userId: req.session.userId }).sort({ date: -1 }).limit(20);
    res.render("meals", { userName: req.session.userName, records, lang: lang(req), page: "meals" });
  } catch (err) { res.status(500).send("Error: " + err.message); }
});

// ── Exercise ──
app.get("/exercise", requireLogin, async (req, res) => {
  try {
    const records = await Routine.find({ userId: req.session.userId, activity: { $nin: [null, ""] } }).sort({ date: -1 }).limit(20);
    res.render("exercise", { userName: req.session.userName, records, lang: lang(req), page: "exercise" });
  } catch (err) { res.status(500).send("Error: " + err.message); }
});

// ── Medication ──
app.get("/medication", requireLogin, (req, res) => {
  res.render("medication", { userName: req.session.userName, lang: lang(req), page: "medication" });
});

// ── Reports ──
app.get("/reports", requireLogin, async (req, res) => {
  try {
    const records = await Routine.find({ userId: req.session.userId }).sort({ date: -1 });
    res.render("reports", { userName: req.session.userName, records, lang: lang(req), page: "reports" });
  } catch (err) { res.status(500).send("Error: " + err.message); }
});

// ── Profile ──
app.get("/profile", requireLogin, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    res.render("profile", { userName: req.session.userName, user, lang: lang(req), page: "profile" });
  } catch (err) { res.status(500).send("Error: " + err.message); }
});

// ── PDF ──
app.get("/download-pdf", requireLogin, async (req, res) => {
  try {
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
    doc.fontSize(14).text("Recommendations:", { underline: true });
    doc.fontSize(11).text("• Monitor blood glucose regularly");
    doc.text("• Eat balanced meals with fibre");
    doc.text("• Exercise at least 30 minutes daily");
    doc.text("• Practice meditation to reduce stress");
    doc.text("• Consult your doctor for personalised advice");
    doc.end();
  } catch (err) { res.status(500).send("PDF error: " + err.message); }
});

// ── Chatbot ──
app.post("/chatbot", requireLogin, (req, res) => {
  const { message } = req.body;
  const l = lang(req);
  const msg = message.toLowerCase();
  let reply = "";
  if (l === "ta") {
    if (msg.includes("glucose") || msg.includes("சர்க்கரை")) reply = "சாதாரண இரத்த சர்க்கரை அளவு 70 முதல் 140 mg/dL வரை இருக்கும்.";
    else if (msg.includes("உணவு") || msg.includes("சாப்பாடு")) reply = "நார்ச்சத்து அதிகம் உள்ள உணவுகள் மற்றும் காய்கறிகள் நல்லவை.";
    else if (msg.includes("உடற்பயிற்சி") || msg.includes("நடை")) reply = "தினமும் குறைந்தது 30 நிமிடம் நடைப்பயிற்சி செய்யவும்.";
    else if (msg.includes("தியானம்") || msg.includes("மன அழுத்தம்")) reply = "தியானம் மன அழுத்தத்தை குறைத்து சர்க்கரை கட்டுப்பாட்டிற்கு உதவும்.";
    else if (msg.includes("தண்ணீர்") || msg.includes("water")) reply = "தினமும் குறைந்தது 8 கிளாஸ் தண்ணீர் குடிக்கவும்.";
    else reply = "தயவுசெய்து நீரிழிவு தொடர்பான கேள்வியை கேளுங்கள்.";
  } else {
    if (msg.includes("glucose") || msg.includes("sugar")) reply = "Normal blood glucose level ranges between 70 and 140 mg/dL.";
    else if (msg.includes("food") || msg.includes("meal") || msg.includes("eat")) reply = "Eat fibre-rich foods, vegetables and avoid excess sugar.";
    else if (msg.includes("exercise") || msg.includes("walk") || msg.includes("activity")) reply = "At least 30 minutes of daily physical activity is recommended.";
    else if (msg.includes("meditation") || msg.includes("stress")) reply = "Meditation helps reduce stress and stabilise glucose levels.";
    else if (msg.includes("water") || msg.includes("drink")) reply = "Drink at least 8 glasses of water daily.";
    else reply = "Please ask a diabetes-related question.";
  }
  res.json({ reply });
});

// ── Records JSON ──
app.get("/records", requireLogin, async (req, res) => {
  const records = await Routine.find({ userId: req.session.userId }).sort({ date: -1 });
  res.json(records);
});

app.listen(process.env.PORT || 3000, () => console.log(`Server running on port ${process.env.PORT || 3000}`));
