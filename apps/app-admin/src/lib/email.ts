import nodemailer from 'nodemailer'

type SendEmailOptions = {
  to: string
  subject: string
  html: string
  text?: string
}

let transporter: nodemailer.Transporter | null

function resolveTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter

  const host = process.env.SMTP_HOST
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASSWORD

  if (!host || !port || !user || !pass) {
    console.warn('SMTP configuration missing. Emails will not be sent. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, and EMAIL_FROM.')
    transporter = null
    return transporter
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })
  return transporter
}

export async function sendEmail({ to, subject, html, text }: SendEmailOptions): Promise<void> {
  const from = process.env.EMAIL_FROM
  if (!from) {
    console.warn('EMAIL_FROM is not configured. Skipping email send.')
    return
  }

  const transport = resolveTransporter()
  if (!transport) {
    console.warn(`Pretending to send email to ${to}. Configure SMTP to enable email delivery.`)
    console.info('[Email preview]', { to, subject, html, text })
    return
  }

  await transport.sendMail({
    from,
    to,
    subject,
    text,
    html,
  })
}
