import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

const resend = new Resend(process.env.RESEND_API_KEY);

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const { email } = await req.json();

  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "signup",
    email: email,
  });

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 400 });
  }

  const verificationLink = data.properties.action_link;

  await resend.emails.send({
    from: "Your App <noreply@yourdomain.com>",
    to: email,
    subject: "Confirm your email",
    html: `
      <h2>Verify your account</h2>
      <a href="${verificationLink}">Click here to confirm</a>
    `,
  });

  return new Response(JSON.stringify({ success: true }));
}
