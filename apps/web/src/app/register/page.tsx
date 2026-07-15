import { Logo } from '@/components/logo';
import { RegisterForm } from './register-form';

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <h1 className="flex items-center gap-2.5 text-xl font-semibold tracking-tight">
          <Logo className="size-9" />
          MeetingBrain
        </h1>
        <p className="muted-on-background max-w-xs text-balance text-sm">
          Превращаем записи встреч в протоколы, задачи и решения
        </p>
      </div>
      <RegisterForm />
    </main>
  );
}
