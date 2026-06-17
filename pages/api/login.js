export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password } = req.body;
  const correct = process.env.KB_PASSWORD || '';

  if (!correct) {
    return res.status(500).json({ error: 'KB_PASSWORD not configured' });
  }

  if (password !== correct) {
    return res.status(401).json({ error: 'Incorrect password' });
  }

  // 7-day httpOnly cookie — never accessible via JS
  const maxAge = 60 * 60 * 24 * 7;
  res.setHeader(
    'Set-Cookie',
    `kb-auth=${correct}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${
      process.env.NODE_ENV === 'production' ? '; Secure' : ''
    }`
  );

  return res.status(200).json({ ok: true });
}
