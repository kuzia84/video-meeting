import { RegisterForm } from './register-form';

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
      <h1 className="text-xl font-semibold">Video Meetings</h1>
      <RegisterForm />
    </main>
  );
}
