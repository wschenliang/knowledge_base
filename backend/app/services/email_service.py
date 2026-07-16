"""异步邮件服务"""

from __future__ import annotations

from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from loguru import logger

from app.config import settings


class EmailService:
    """异步邮件发送服务"""

    @staticmethod
    async def send_reset_password_email(to_email: str, reset_url: str) -> None:
        """发送密码重置邮件"""
        if not settings.SMTP_HOST:
            logger.warning("SMTP 未配置，跳过发送重置密码邮件")
            return

        subject = "CogniBase - 密码重置"
        html_content = EmailService._render_reset_password_template(reset_url)

        await EmailService._send_email(to_email, subject, html_content)
        logger.info(f"密码重置邮件已发送至 {to_email}")

    @staticmethod
    def _render_reset_password_template(reset_url: str) -> str:
        """渲染密码重置邮件模板"""
        return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>CogniBase 密码重置</title>
</head>
<body style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
  <h2 style="color: #1e293b;">CogniBase 密码重置</h2>
  <p>您好，</p>
  <p>管理员已为您触发密码重置。请点击下方链接重置您的密码：</p>
  <a href="{reset_url}" style="display: inline-block; padding: 12px 24px; background: #2563eb; color: white; text-decoration: none; border-radius: 8px; margin: 16px 0;">重置密码</a>
  <p style="color: #64748b; font-size: 14px;">此链接将在 1 小时后失效。如非本人操作，请忽略此邮件。</p>
  <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;">
  <p style="color: #94a3b8; font-size: 12px;">CogniBase 企业知识库系统</p>
</body>
</html>"""

    @staticmethod
    async def _send_email(to_email: str, subject: str, html_content: str) -> None:
        """发送 HTML 邮件"""
        try:
            import aiosmtplib
        except ImportError:
            logger.error("aiosmtplib 未安装，无法发送邮件")
            raise RuntimeError("邮件服务未配置：aiosmtplib 未安装")

        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = settings.SMTP_FROM or settings.SMTP_USER
        msg["To"] = to_email

        html_part = MIMEText(html_content, "html", "utf-8")
        msg.attach(html_part)

        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            start_tls=settings.SMTP_TLS,
        )
