import LoginForm from "@/components/LoginForm";
import RequireGuest from "@/components/RequireGuest";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "登录 - 知识库",
  description: "登录您的知识库账号",
};

export default function LoginPage() {
  return (
    <RequireGuest>
      <LoginForm mode="login" />
    </RequireGuest>
  );
}