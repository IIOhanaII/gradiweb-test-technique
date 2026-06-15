import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Comparateur de produits</h1>
        <p className={styles.text}>
          App d&apos;administration du comparateur de produits Shopify :
          configurez les champs comparés et suivez les statistiques de
          comparaison. L&apos;app s&apos;utilise installée dans l&apos;admin de
          la boutique.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Domaine de la boutique</span>
              <input
                className={styles.input}
                type="text"
                name="shop"
                defaultValue="gradiweb-test.myshopify.com"
              />
              <span>ex : ma-boutique.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Se connecter
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Configuration</strong>. Activez/désactivez et réordonnez les
            champs affichés dans le tableau de comparaison côté boutique.
          </li>
          <li>
            <strong>Statistiques</strong>. Produits les plus comparés sur 30
            jours glissants, avec lien vers la fiche produit.
          </li>
          <li>
            <strong>Tracking</strong>. Les comparaisons sont collectées côté
            serveur via un App Proxy, sans exposer de jeton.
          </li>
        </ul>
      </div>
    </div>
  );
}
