import "./globals.css";

export const metadata = {
  title: "Chafa AI",
  description: "Multi-Agent AI Workspace",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
