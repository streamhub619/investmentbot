const nodemailer = require("nodemailer");

function getTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

async function sendPasswordResetEmail(to, resetToken) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.log("Email not configured, skipping reset email");
    return;
  }

  const transporter = getTransporter();
  const resetLink = `http://localhost:3000/reset-password.html?token=${resetToken}`;

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to,
    subject: "🔑 InvestmentBot Password Reset",
    text: `You requested a password reset.\n\nClick this link to reset your password (valid for 30 minutes):\n${resetLink}\n\nIf you didn't request this, ignore this email.`,
  });

  console.log(`📧 Password reset email sent to ${to}`);
}

module.exports = { sendPasswordResetEmail };