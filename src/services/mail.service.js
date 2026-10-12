import nodemailer from 'nodemailer';
import {Resend} from 'resend';
import {env} from '../config/env.js';
import {AppError} from '../utils/response.js';

let transporter = null;
let resendClient = null;

function getResend() {
  if (!resendClient && env.resendApiKey) {
    resendClient = new Resend(env.resendApiKey);
  }
  return resendClient;
}

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth: {
        user: env.smtpUser,
        pass: env.smtpPass.replace(/['"\s]/g, ''),
      },
      tls: {
        rejectUnauthorized: env.smtpRejectUnauthorized,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  }
  return transporter;
}

async function sendMail({to, subject, text}) {
  const resend = getResend();
  if (resend) {
    const {data, error} = await resend.emails.send({
      from: env.resendFrom || 'R2Cart <onboarding@resend.dev>',
      to: [to],
      subject,
      text,
    });
    if (error) {
      console.error('Resend delivery error:', error);
      throw new AppError(`Email delivery failed via Resend: ${error.message}`, 503);
    }
    return data;
  }

  const transport = getTransporter();
  return await transport.sendMail({
    from: `R2Cart <${env.smtpFrom || env.smtpUser}>`,
    to,
    subject,
    text,
  });
}

function handleMailError(error) {
  console.error('SMTP delivery failed with details:', {
    code: error.code,
    responseCode: error.responseCode,
    command: error.command,
    message: error.message,
  });
  const code = error.code || '';
  const responseCode = error.responseCode || 0;
  const msg = (error.message || '').toLowerCase();

  if (code === 'EAUTH' || responseCode === 535 || responseCode === 534 || /535|534|5\.7\.[89]/i.test(msg)) {
    throw new AppError('Google rejected SMTP authentication (Bad Credentials). Kripya confirm karein ki App Password sahi account ke andar generate kiya gaya hai.', 503);
  }
  if (/econnrefused|enotfound|etimedout|esocket/i.test(code) || /econnrefused|enotfound|etimedout/i.test(msg)) {
    throw new AppError('Email service is temporarily unreachable on SMTP port. On Render Free tier, please configure RESEND_API_KEY.', 503);
  }
  if (responseCode === 550 || /550|recipient.*rejected/i.test(msg)) {
    throw new AppError('The recipient email address was rejected by the mail server.', 400);
  }
  throw new AppError('Could not send the verification email. Please try again.', 503);
}

export async function sendOtpEmail(to, otp, purpose = 'signup') {
  if (env.nodeEnv !== 'production' || env.exposeOtp) {
    console.log(`[R2Cart OTP] ${purpose.toUpperCase()} code for ${to}: ${otp}`);
  }

  if (env.otpProvider !== 'smtp' && env.otpProvider !== 'resend') {
    if (env.nodeEnv === 'production' && !env.exposeOtp) throw new AppError('Email delivery is not configured', 503);
    return;
  }

  const reset = purpose === 'password_reset';
  const subject = reset ? 'Reset your R2Cart password' : 'Your R2Cart verification code';
  const body = [
    reset ? `Use ${otp} to reset your R2Cart password.` : `Your R2Cart verification code is ${otp}.`,
    '',
    `This code expires in ${env.otpMinutes} minutes.`,
    'Never share this code with anyone.',
    'If you did not request this, you can safely ignore this email.',
  ].join('\r\n');

  try {
    await sendMail({to, subject, text: body});
  } catch (error) {
    if (env.resendApiKey) throw error;
    handleMailError(error);
  }
}

export async function sendSupportTicketEmail({ticketNumber, issueType, subject, description, orderId, customer}) {
  if (!env.supportEmail) return false;
  if (env.otpProvider !== 'smtp' && env.otpProvider !== 'resend') {
    console.log(`R2Cart support ticket ${ticketNumber} for ${env.supportEmail}`);
    return false;
  }

  try {
    await sendMail({
      to: env.supportEmail,
      subject: `R2Cart support: ${ticketNumber} · ${subject}`,
      text: [
        'A new customer support ticket has been submitted.',
        '',
        `Ticket: ${ticketNumber}`,
        `Issue type: ${issueType}`,
        `Customer: ${customer.name}`,
        `Email: ${customer.email}`,
        `Mobile: ${customer.mobile || 'Not provided'}`,
        `Order ID: ${orderId || 'Not linked'}`,
        '',
        `Subject: ${subject}`,
        '',
        'Customer message:',
        description,
        '',
        'Open the R2Cart Admin support panel to respond.',
      ].join('\r\n'),
    });
    return true;
  } catch (error) {
    console.error(`Support notification email failed for ticket ${ticketNumber}:`, error.message);
    return false;
  }
}
