export default function handler(req, res) {
  res.setHeader('Set-Cookie', 'kb-auth=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict');
  res.redirect(302, '/login');
}
