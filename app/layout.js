export const metadata = {
  title: "Mica's Board",
  description: 'Operations board for Mica',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
