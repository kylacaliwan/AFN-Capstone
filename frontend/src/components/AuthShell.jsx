const AuthShell = ({
  children,
  backgroundImage = '/login-bg.jpg',
  headline = 'Your Partner in Solar and Smart Home Solutions.',
}) => {
  return (
    <main className="min-h-screen bg-white">
      <section className="flex min-h-screen w-full overflow-hidden bg-white">
        <div className="relative hidden w-[61%] overflow-hidden lg:block">
          <img
            src={backgroundImage}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-black/28" />
          <div className="relative flex h-full items-center px-16 xl:px-20">
            <h1 className="max-w-[720px] text-[54px] font-extrabold leading-[1.32] text-white xl:text-[62px]">
              {headline}
            </h1>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center px-5 py-8 sm:px-8 lg:px-12">
          <div className="w-full max-w-[440px]">
            {children}
          </div>
        </div>
      </section>
    </main>
  );
};

export default AuthShell;
