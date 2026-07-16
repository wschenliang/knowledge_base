import LoginForm from "@/components/LoginForm";
import RequireGuest from "@/components/RequireGuest";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "注册 - 知识库",
  description: "创建您的知识库账号",
};

export default function RegisterPage() {
  return (
    <RequireGuest>
      <LoginForm mode="register" />
    </RequireGuest>
  );
}