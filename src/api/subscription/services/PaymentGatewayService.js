'use strict';

/**
 * PaymentGatewayService service.
 */
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_KEY);
const {DateTime} = require('luxon');

module.exports = () => ({
    async createStripeCustomer(name, email, phone) {
        const stripeCustomer = await stripe.customers.create({
            "name": name,
            "email": email,
            "phone": phone,
        });

        return stripeCustomer;
    },


    //used to save CC cards in Stripe after creating customer (CI)
    async setupPaymentIntent(stripeCustomerId) {
        const setupIntent = await stripe.setupIntents.create({
            customer: stripeCustomerId,
            payment_method_types: ['card'],
        });

        return setupIntent.client_secret;
    },

    async getPaymentMethods(stripeCustomerId) {
        const paymentMethods = await stripe.paymentMethods.list({
            customer: stripeCustomerId,
            type: 'card',
        });
        return paymentMethods.data;
    },

    //DEPRECATED
    async attachSubscription(stripeCustomerId) {
        const stripeSubscription = await stripe.subscriptions.create({
            customer: stripeCustomerId,
            items: [{ price: process.env.STRIPE_PRICE_ID }],
            billing_cycle_anchor: DateTime.utc().endOf('month').toUnixInteger()
        });

        return stripeSubscription;
    },

    //DEPRECATED
    async createUsageRecord(subscriptionId, qty) {
        await stripe.subscriptionItems.createUsageRecord(
            subscriptionId,
            { quantity: qty }
        );
    }
});
