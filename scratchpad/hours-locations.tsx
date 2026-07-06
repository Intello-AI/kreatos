import { Clock, MapPin, Phone } from "lucide-react";
import { useTranslations } from "next-intl";

import { Reveal } from "@/components/shared/reveal";

type Location = {
  city: string;
  address: string;
  phone: string;
  hours: string;
};

/** Oficinas/sucursales: directorio de ubicaciones con dirección, teléfono y horario. */
export function HoursLocations({ ns }: { ns: string }) {
  const t = useTranslations(ns);
  const locations = t.raw("locations") as Location[];

  return (
    <section className="border-t border-border bg-secondary py-(--section-gap) text-secondary-foreground">
      <div className="mx-auto grid w-full max-w-6xl gap-14 px-6 lg:grid-cols-[minmax(0,20rem)_1fr] lg:gap-20 lg:px-8">
        <Reveal>
          <div className="lg:sticky lg:top-28">
            <p className="text-xs font-medium tracking-[0.25em] text-primary uppercase">
              {t("eyebrow")}
            </p>
            <h2 className="mt-5 font-display text-[clamp(2rem,4vw,3rem)] leading-[0.95] tracking-tight text-balance">
              {t("title")}
            </h2>
            <div
              className="mt-8 hidden h-px w-24 bg-border lg:block"
              aria-hidden="true"
            />
            <p
              className="mt-8 hidden font-display text-6xl text-muted-foreground/40 lg:block"
              aria-hidden="true"
            >
              {String(locations.length).padStart(2, "0")}
            </p>
          </div>
        </Reveal>

        <ol className="flex flex-col">
          {locations.map((location, index) => (
            <li key={location.city}>
              <Reveal delay={index * 70}>
                <article className="group grid gap-6 border-t border-border py-8 first:border-t-0 first:pt-0 sm:grid-cols-[1fr_auto] sm:items-start sm:gap-10">
                  <div>
                    <div className="flex items-baseline gap-3">
                      <span
                        className="font-display text-sm text-muted-foreground/60 tabular-nums"
                        aria-hidden="true"
                      >
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <h3 className="font-display text-2xl tracking-tight sm:text-3xl">
                        {location.city}
                      </h3>
                    </div>
                    <p className="mt-3 flex items-start gap-2.5 pl-[calc(0.75rem+2ch)] text-sm leading-relaxed text-muted-foreground">
                      <MapPin
                        className="mt-0.5 size-4 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      {location.address}
                    </p>
                  </div>

                  <dl className="flex flex-col gap-3 pl-[calc(0.75rem+2ch)] text-sm sm:min-w-52 sm:pl-0 sm:text-right">
                    <div className="flex items-center gap-2.5 sm:flex-row-reverse">
                      <Phone
                        className="size-4 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <dt className="sr-only">{t("phoneLabel")}</dt>
                      <dd className="tabular-nums">{location.phone}</dd>
                    </div>
                    <div className="flex items-center gap-2.5 text-muted-foreground sm:flex-row-reverse">
                      <Clock
                        className="size-4 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <dt className="sr-only">{t("hoursLabel")}</dt>
                      <dd>{location.hours}</dd>
                    </div>
                  </dl>
                </article>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
