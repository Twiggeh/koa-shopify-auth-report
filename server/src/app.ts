import dotenv from 'dotenv';
import Koa, { Context } from 'koa';
import createShopifyAuth, { verifyRequest } from '@shopify/koa-shopify-auth';
import Shopify, { ApiVersion } from '@shopify/shopify-api';
import Router from 'koa-router';

import send from 'koa-send';
import { dirname, resolve } from 'path';
import { URL } from 'url';

dotenv.config();

// @ts-ignore

const ACTIVE_SHOPIFY_SHOPS: Record<string, unknown> = {};
const __dirname = decodeURI(dirname(new URL(import.meta.url).pathname));
const PROJECT_ROOT = resolve(__dirname, '../../../');

Shopify.Context.initialize({
	API_KEY: process.env.SHOPIFY_API_KEY,
	API_SECRET_KEY: process.env.SHOPIFY_API_SECRET,
	SCOPES: process.env.SHOPIFY_API_SCOPES.split(','),
	HOST_NAME: process.env.SHOPIFY_APP_URL.replace(/https:\/\//, ''),
	API_VERSION: ApiVersion.October20,
	IS_EMBEDDED_APP: true,
	SESSION_STORAGE: new Shopify.Session.MemorySessionStorage(),
});

const port = parseInt(process.env.PORT, 10) || 3000;
const dev = process.env.NODE_ENV !== 'production';

const app = new Koa();
const router = new Router();

app.keys = [Shopify.Context.API_SECRET_KEY];

app.use(
	createShopifyAuth({
		afterAuth(ctx) {
			const { shop, scope } = ctx.state.shopify;
			ACTIVE_SHOPIFY_SHOPS[shop] = scope;

			ctx.redirect(`/`);
		},
	})
);

const handleRequest = async (ctx: Context) => {
	send(ctx, resolve(PROJECT_ROOT, 'client/dist/index.html'));
	ctx.respond = false;
	ctx.res.statusCode = 200;
};

router.get('/', async ctx => {
	const shop = ctx.query.shop;

	if (!Array.isArray(shop) && ACTIVE_SHOPIFY_SHOPS[shop] === undefined) {
		ctx.redirect(`/auth?shop=${shop}`);
	} else {
		await handleRequest(ctx);
	}
});

router.get('(/_next/static/.*)', handleRequest);
router.get('/_next/webpack-hmr', handleRequest);

router.get('/public/*', ctx => {
	send(ctx, resolve(PROJECT_ROOT, 'client/dist/', ctx.req.url));
});

router.get('(.*)', verifyRequest(), handleRequest);

app.use(router.allowedMethods());
app.use(router.routes());

app.listen(port, () => {
	console.log(`Server running on port ${port}`);
});
