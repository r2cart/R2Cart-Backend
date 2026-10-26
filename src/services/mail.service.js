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

async function sendMailViaRelay({to, subject, text, html, from}) {
  const relayUrl = process.env.MAIL_RELAY_URL || 'https://r2cart.netlify.app/.netlify/functions/mail-relay';
  const response = await fetch(relayUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-mail-secret': 'r2cart-secret-2026',
    },
    body: JSON.stringify({
      to,
      subject,
      text,
      html,
      from: from || `R2Cart <${env.smtpUser || 'r2cartsupport@gmail.com'}>`,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    throw new Error(data.error || `Mail relay returned HTTP ${response.status}`);
  }
  return data;
}

async function sendMail({to, subject, text, html}) {
  const resend = getResend();
  if (resend) {
    try {
      const fromEmail = env.resendFrom || 'R2Cart <otp@r2cart.in>';
      const targetEmails = Array.isArray(to) ? to : [to];
      const result = await resend.emails.send({
        from: fromEmail,
        to: targetEmails,
        subject,
        text,
        html,
      });
      if (result.error) {
        console.warn('Resend returned error, falling back:', result.error);
        throw new Error(result.error.message || 'Resend send failed');
      }
      return result.data;
    } catch (resendErr) {
      console.warn('Resend send failed, trying relay/transporter fallback:', resendErr.message);
    }
  }

  try {
    return await sendMailViaRelay({to, subject, text, html});
  } catch (relayError) {
    console.warn('Mail relay failed, trying direct transporter:', relayError.message);
    const transport = getTransporter();
    return await transport.sendMail({
      from: `R2Cart <${env.smtpFrom || env.smtpUser}>`,
      to,
      subject,
      text,
      html,
    });
  }
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

  const reset = purpose === 'password_reset';
  const subject = reset ? `${otp} is your R2Cart password reset code` : `${otp} is your R2Cart verification code`;
  const body = [
    `Hello,`,
    ``,
    reset ? `Use ${otp} to reset your R2Cart account password.` : `Your R2Cart verification code is ${otp}.`,
    ``,
    `This code is valid for ${env.otpMinutes} minutes. For security, never share this code with anyone.`,
    ``,
    `Regards,`,
    `Team R2Cart`,
  ].join('\r\n');

  const html = `
    <!DOCTYPE html>
    <html>
      <body style="margin:0;padding:24px;background-color:#f6f8f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#183a25;">
        <table align="center" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:14px;border:1px solid #dbe6de;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.04);">
          <tr>
            <td style="background-color:#173a28;padding:24px 28px;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:900;letter-spacing:-0.5px;">R2<span style="color:#22c55e;">Cart</span></h1>
              <p style="margin:4px 0 0;color:#9bc9ab;font-size:12px;">Fresh Groceries Delivered Fast</p>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <h2 style="margin:0 0 12px;color:#183a25;font-size:17px;font-weight:700;">
                ${reset ? 'Password Reset Verification' : 'Email Verification Code'}
              </h2>
              <p style="margin:0 0 20px;color:#495c50;font-size:14px;line-height:1.5;">
                ${reset ? 'Please enter this one-time code to reset your password:' : 'Thank you for choosing R2Cart. Use this verification code to complete your signup:'}
              </p>
              <div style="background-color:#eef8f1;border:1.5px dashed #22c55e;border-radius:10px;padding:18px;text-align:center;margin:0 0 20px;">
                <div style="font-size:10px;color:#15803d;font-weight:800;letter-spacing:1px;text-transform:uppercase;margin-bottom:6px;">Your 6-Digit Code</div>
                <div style="font-size:32px;font-weight:900;letter-spacing:6px;color:#173a28;font-family:monospace;">${otp}</div>
              </div>
              <p style="margin:0 0 6px;color:#6d7f73;font-size:12px;">⏱️ Valid for <strong>${env.otpMinutes} minutes</strong>.</p>
              <p style="margin:0;color:#6d7f73;font-size:12px;">🔒 If you did not request this code, you can safely ignore this email.</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f9fbf9;padding:16px 28px;border-top:1px solid #eef2ee;text-align:center;">
              <p style="margin:0;color:#899a8f;font-size:11px;">R2Cart Online Grocery Delivery · <a href="mailto:r2cartsupport@gmail.com" style="color:#16a34a;text-decoration:none;">r2cartsupport@gmail.com</a></p>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  try {
    await sendMail({to, subject, text: body, html});
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

export async function sendContactInquiryEmail({name, email, subject, message, ticketNumber}) {
  const targetEmail = env.supportEmail || 'r2cartsupport@gmail.com';
  if (env.otpProvider !== 'smtp' && env.otpProvider !== 'resend') {
    console.log(`R2Cart contact inquiry from ${name} (${email}) for ${targetEmail}`);
    return false;
  }

  try {
    await sendMail({
      to: targetEmail,
      subject: `[Contact Us] ${ticketNumber ? `${ticketNumber} · ` : ''}${subject}`,
      text: [
        'A new message has been submitted via the Contact Us form on R2Cart.',
        '',
        `From: ${name}`,
        `Email: ${email}`,
        `Subject: ${subject}`,
        ...(ticketNumber ? [`Ticket: ${ticketNumber}`] : []),
        '',
        'Message:',
        message,
        '',
        'Open the R2Cart Admin support panel to review and resolve this inquiry.',
      ].join('\r\n'),
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
          <div style="background: #168447; color: #fff; padding: 20px 24px;">
            <h2 style="margin: 0; font-size: 20px;">New Contact Us Inquiry</h2>
            <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">R2Cart Customer Desk</p>
          </div>
          <div style="padding: 24px;">
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-size: 13px; width: 120px;"><strong>Sender Name:</strong></td>
                <td style="padding: 6px 0; font-size: 14px; font-weight: bold;">${name}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-size: 13px;"><strong>Sender Email:</strong></td>
                <td style="padding: 6px 0; font-size: 14px;"><a href="mailto:${email}" style="color: #168447; text-decoration: none;">${email}</a></td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-size: 13px;"><strong>Subject:</strong></td>
                <td style="padding: 6px 0; font-size: 14px;">${subject}</td>
              </tr>
              ${ticketNumber ? `
              <tr>
                <td style="padding: 6px 0; color: #64748b; font-size: 13px;"><strong>Ticket Number:</strong></td>
                <td style="padding: 6px 0; font-size: 14px;"><span style="background: #e9f7ef; color: #168447; padding: 2px 8px; border-radius: 6px; font-weight: bold;">${ticketNumber}</span></td>
              </tr>
              ` : ''}
            </table>
            <div style="background: #f8fafc; border-left: 4px solid #168447; padding: 16px; border-radius: 4px; margin-bottom: 20px;">
              <p style="margin: 0; font-size: 14px; white-space: pre-wrap;">${message}</p>
            </div>
            <p style="font-size: 12px; color: #64748b; margin: 0;">This inquiry has been logged in the R2Cart Admin Support panel so the admin can review, reply, and resolve it.</p>
          </div>
        </div>
      `,
    });
    return true;
  } catch (error) {
    console.error(`Contact inquiry email failed for ticket ${ticketNumber}:`, error.message);
    return false;
  }
}

