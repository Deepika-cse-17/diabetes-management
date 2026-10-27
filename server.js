const express    = require("express");
const mongoose   = require("mongoose");
const bodyParser = require("body-parser");
const PDFDocument= require("pdfkit");
const bcrypt     = require("bcryptjs");
const session    = require("express-session");

const Routine    = require("./models/Routine");
const User       = require("./models/User");

const app = express();

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));
app.set("view engine", "ejs");

app.use(session({
  secret: "diabetes_secret_key_2024",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 day
}));

mongoose.connect("mongodb://127.0.0.1:27017/diabetesDB")
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log(err));

// ── Auth middleware ──────────────────────────────────────
function requireLogin(req, res, next) {
  if (req.session.userId) return next();
  res.redirect("/login");
}

// ── Auth routes ──────────────────────────────────────────

// Login page
app.get("/login", (req, res) => {
  if (req.session.userId) return res.redirect("/");
  res.render("login", { error: null });
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.render("login", { error: "No account found with that email 😕" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.render("login", { error: "Wrong password, please try again 🔐" });

    req.session.userId   = user._id;
    req.session.userName = user.name;
    res.redirect("/");
  } catch (err) {
    res.render("login", { error: "Something went wrong. Please try again." });
  }
});

// Signup page
app.get("/signup", (req, res) => {
  if (req.session.userId) return res.redirect("/");
  res.render("signup", { error: null });
});

app.post("/signup", async (req, res) => {
  const { name, email, password, confirm, age } = req.body;
  try {
    if (password !== confirm)
      return res.render("signup", { error: "Passwords do not match 🔑" });

    const existing = await User.findOne({ email });
    if (existing)
      return res.render("signup", { error: "An account with this email already exists 📧" });

    const hashed = await bcrypt.hash(password, 10);
    const user   = new User({ name, email, password: hashed, age });
    await user.save();

    req.session.userId   = user._id;
    req.session.userName = user.name;
    res.redirect("/");
  } catch (err) {
    res.render("signup", { error: "Something went wrong. Please try again." });
  }
});

// Logout
app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

// ── Main app routes ──────────────────────────────────────

app.get("/", requireLogin, (req, res) => {
  res.render("index", { userName: req.session.userName });
});

// Submit form
app.post("/submit", requireLogin, async (req, res) => {
  const { name, age, glucose, breakfast, lunch, dinner, snacks, activity, meditation, stressNote, language } = req.body;

  const routine = new Routine({ name, age, glucose, breakfast, lunch, dinner, snacks, activity, meditation, stressNote, userId: req.session.userId });
  await routine.save();

  let recommendations = [];

  if (glucose > 180)      recommendations.push({ text: language === 'ta' ? 'இரத்த சர்க்கரை அதிகம் ⚠️' : '⚠️ Blood glucose is high', severity: 'High' });
  else if (glucose < 70)  recommendations.push({ text: language === 'ta' ? 'இரத்த சர்க்கரை குறைவு ⚠️' : '⚠️ Blood glucose is low', severity: 'High' });
  else                    recommendations.push({ text: language === 'ta' ? 'இரத்த சர்க்கரை சாதாரணம் ✅' : '✅ Blood glucose is normal', severity: 'Low' });

  recommendations.push({ text: language === 'ta' ? '🥦 காய்கறி மற்றும் நார்ச்சத்து அதிகரிக்கவும்' : '🥦 Increase vegetables & fiber in meals', severity: 'Medium' });

  if (activity && activity.length > 3) recommendations.push({ text: language === 'ta' ? '🏃 உடற்பயிற்சி செய்துள்ளீர்கள் — சபாஷ்!' : '🏃 Great job! Physical activity recorded', severity: 'Low' });
  else                                  recommendations.push({ text: language === 'ta' ? '🚶 உடற்பயிற்சி குறைவு — கொஞ்சம் நடக்கலாம்' : '🚶 Try a short walk today!', severity: 'Medium' });

  if (meditation && meditation.length > 3) recommendations.push({ text: language === 'ta' ? '🧘 தியானம் செய்துள்ளீர்கள் — மிக நல்லது!' : '🧘 Meditation practiced — well done!', severity: 'Low' });
  else                                      recommendations.push({ text: language === 'ta' ? '🧘 தியானம் செய்ய பரிந்துரை' : '🧘 Try 10 minutes of meditation today', severity: 'Medium' });

  if (stressNote && stressNote.length > 20) recommendations.push({ text: language === 'ta' ? '😟 மனஅழுத்தம் அதிகம் — ஓய்வு எடுங்கள்' : '😟 Stress seems high — take some rest', severity: 'High' });

  res.render("dashboard", { routine, recommendations, language, userName: req.session.userName });
});

// PDF download
app.get("/download-pdf", requireLogin, (req, res) => {
  const { name, age } = req.query;
  const doc = new PDFDocument();
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=diabetes-report.pdf`);
  doc.pipe(res);

  doc.fontSize(18).text("Diabetes Daily Report", { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).text(`Name: ${name}`);
  doc.text(`Age: ${age}`);
  doc.text(`Date: ${new Date().toDateString()}`);
  doc.moveDown();
  doc.text("General Recommendations:");
  doc.text("• Monitor blood glucose regularly");
  doc.text("• Eat balanced meals");
  doc.text("• Exercise daily");
  doc.text("• Practice meditation");
  doc.text("• Reduce stress");
  doc.end();
});

// View all records
app.get("/records", requireLogin, async (req, res) => {
  const records = await Routine.find({ userId: req.session.userId }).sort({ date: -1 });
  res.json(records);
});

// Chatbot
app.post("/chatbot", requireLogin, (req, res) => {
  const { message, language } = req.body;
  let reply = "";
  const msg = message.toLowerCase();

  if (language === "ta") {
    if (msg.includes("glucose") || msg.includes("சர்க்கரை"))
      reply = "🩸 சாதாரண இரத்த சர்க்கரை அளவு 70 முதல் 140 mg/dL வரை இருக்கும்.";
    else if (msg.includes("உணவு"))
      reply = "🥗 நார்ச்சத்து அதிகம் உள்ள உணவுகள் மற்றும் காய்கறிகள் நல்லவை.";
    else if (msg.includes("உடற்பயிற்சி"))
      reply = "🏃 தினமும் குறைந்தது 30 நிமிடம் நடைப்பயிற்சி செய்யவும்.";
    else if (msg.includes("தியானம்") || msg.includes("மன அழுத்தம்"))
      reply = "🧘 தியானம் மன அழுத்தத்தை குறைத்து சர்க்கரை கட்டுப்பாட்டிற்கு உதவும்.";
    else
      reply = "😊 தயவுசெய்து உங்கள் கேள்வியை தெளிவாக கேளுங்கள்.";
  } else {
    if (msg.includes("glucose"))
      reply = "🩸 Normal blood glucose level ranges between 70 and 140 mg/dL.";
    else if (msg.includes("food") || msg.includes("meal"))
      reply = "🥗 Eat fiber-rich foods, vegetables, and avoid excess sugar.";
    else if (msg.includes("exercise"))
      reply = "🏃 At least 30 minutes of daily physical activity is recommended.";
    else if (msg.includes("meditation") || msg.includes("stress"))
      reply = "🧘 Meditation helps reduce stress and stabilize glucose levels.";
    else
      reply = "😊 Please ask a diabetes-related question.";
  }

  res.json({ reply });
});

app.listen(3000, () => console.log("🚀 Server running on http://localhost:3000"));
