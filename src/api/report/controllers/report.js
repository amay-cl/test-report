'use strict';

/**
 *  report controller
 */

const { createCoreController } = require('@strapi/strapi').factories;

//module.exports = createCoreController('api::report.report');

module.exports = createCoreController("api::report.report", ({ strapi }) => ({

    async generateReport(ctx) {
        //ctx.body = 'Hello World!';
        const projectId = ctx.query.project_id;
        const report = await strapi.db.query('api::report.report').findMany({
            where: {
                   project_id:projectId 
                 },
         
        });
        return report;

    }
    
  }));


