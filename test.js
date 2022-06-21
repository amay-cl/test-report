"use strict";

/**
 *  annotation controller
 */
var axios = require("axios");
const { createCoreController } = require("@strapi/strapi").factories;
const moment = require("moment");
const fs = require("fs");
const PDFDocument = require("pdfkit-table");
//const randomstring = require("randomstring");
const AWS = require("aws-sdk");
const { generate } = require("randomstring");

module.exports = createCoreController(
  "api::annotation.annotation",
  ({ strapi }) => ({
    async create(ctx) {
      const sql = `select max(annotation_number) from annotations where elevation_id = ${ctx.request.body.data.ElevationId}`;
      const data = await strapi.db.connection.raw(sql);
      ctx.request.body.data.AnnotationNumber =
        data.rows[0].max == null ? 1 : ++data.rows[0].max;
      const response = await super.create(ctx);
      return response;
    },

    async find(ctx) {
      let results = await super.find(ctx);

      const elevationId = ctx.request.query.filters.Elevation;

      const data = results.data;
      const meta = results.meta;

      const sql = `select max(annotation_number) from annotations where elevation_id = ${elevationId}`;
      const countResult = await strapi.db.connection.raw(sql);
      meta.annotationCount =
        countResult.rows[0].max == null ? 0 : countResult.rows[0].max;

      data.forEach((element) => {
        if (element.attributes.ImagesPath != null) {
          element.attributes.ImageUrls = [];
          element.attributes.ImagesPath.forEach((image, index) => {
            element.attributes.ImageUrls.push(
              strapi.getObjectPresignedUrl(image)
            );
          });
        }
      });

      return { data, meta };
    },

    async findOne(ctx) {
      let results = await super.findOne(ctx);

      const data = results.data;
      const meta = results.meta;
      data.attributes.ImageUrls = [];

      data.attributes.ImagesPath.forEach((image, index) => {
        data.attributes.ImageUrls.push(strapi.getObjectPresignedUrl(image));
      });

      return { data, meta };
    },

    async getpdf(ctx) {
      const Pid = ctx.query.id;
      const elevation = await strapi.db
        .query("api::elevation.elevation")
        .findMany({
          where: { project_id: Pid },
        });

      let generatedResponse = [];
      const project = await strapi.db.query("api::project.project").findOne({
        where: { id: Pid },
      });
      

      let allAnnotations = [];
      let allAcAnnotations = [];
      await Promise.all(
        elevation.map(async (element) => {
          try {
            //get annotations for this elevation
            const annotationsAc = await strapi.db
              .query("api::annotation.annotation")
              .findMany({
                where: {
                  elevation_id: element.id,
                  Causes: { $containsi: "WINDOW AC" },
                },
              });
          
            const annotations = await strapi.db
              .query("api::annotation.annotation")
              .findMany({
                where: {
                  elevation_id: element.id,
                  Causes: { $notContainsi: "WINDOW AC" },
                },
              });
           
           annotationsAc.forEach(function (al) {
              allAcAnnotations.push([
                al.AnnotationObject.position.position,
                al.AnnotationNumber,
                al.ConditionDescription,
                al.Causes,
                al.Recommendation,
                al.Unit,
                al.Quantity,
              ]);
            });

            annotations.forEach(function (al) {
              allAnnotations.push([
                al.AnnotationObject.position.position,
                al.AnnotationNumber,
                al.ConditionDescription,
                al.Causes,
                al.Recommendation,
                al.Unit,
                al.Quantity,
              ]);
            });
          } catch (error) {
            console.log("error" + error);
          }
        })
      );

      async function generateReport(allAcAnnotations) {
        let doc = new PDFDocument({ margin: 30, size: "A4" });
        const datetimestamp = Date.now();
        const fileName = `public/uploads/WindowAcDetailed${datetimestamp}.pdf`;
        doc.pipe(fs.createWriteStream(fileName));
       
        doc
          .font("Times-Bold")
          .text("TABLE OF CONDITIONS OBSERVED", { align: "center" });
        doc.moveDown();
        doc.moveDown(1);
        doc.moveDown(2);

        const t1 = {
          headers: [
            {
              label: `DEVELOPMENT NAME:${project.Name}`,
              property: "name",
              width: 150,
            },

            {
              label: `BUILDING:${project.BuildingAddress}`,
              property: "block",
              width: 150,
            },
            {
              label: `ADDRESS:${project.ProjectAddress}`,
              property: "lot",
              width: 220,
            },
          ],
          datas: [
            {
              name: `BIN: ${project.BIN}`,
              block: `BLOCK No.: ${project.Block}`,
              lot: `LOT No.: ${project.LOT}`,
            },
            {
              name: `INSPECTION DATE:${moment(project.ProjectDate).format(
                "MM/DD/yyyy"
              )}`,
              block: `DOB CONTROL No.: ${project.DOBControlNumber}`,
              lot: `INSPECTING A/E: ${project.AEConsultingInspector}`,
            },
          ],
        };

        doc.table(t1, {
          prepareHeader: () => doc.font("Helvetica-Bold").fontSize(8),
          prepareRow: (indexColumn) => {
            doc.font("Helvetica").fontSize(8);
            indexColumn === 0;
          },
        });

        doc.moveDown(1);
        const table = {
          headers: [
            "Location",
            "Photo No",
            "Condition Description",
            "Causes",
            "Recommendation",
            "Unit",
            "QTY",
          ],

          rows: allAcAnnotations,
        };

        await doc.table(table, {
          columnsSize: [75, 60, 125, 80, 90, 50, 50],
        });
        doc.end();
        generatedResponse.push(doc);

        var fileContent = fs.createReadStream(fileName);
        fileContent.on("error", function (err) {
          console.log("File Error", err);
        });

        const params = {
          Bucket: "build10x-dev",
          Key: `projects/${Pid}/reports/WindowAc${datetimestamp}.pdf`,
          Body: fileContent,
        };

        strapi.s3.upload(params, (err, data) => {
          // console.log("data---", data);
          console.log("err---", err);
        });

        await strapi.query("api::report.report").create({
          where: {
            where: { id: Pid },
          },
          data: {
            projectId: Pid,
            name: `WindowAc${datetimestamp}.pdf`,
          },
        });
      }
      if (
        typeof allAcAnnotations !== "undefined" &&
        allAcAnnotations.length > 0
      ) {
        generateReport(allAcAnnotations);
      }

      let doc = new PDFDocument({ margin: 30, size: "A4" });
      const datetimestamp = Date.now();
      const fileName = `public/uploads/${datetimestamp}.pdf`;
      doc.pipe(fs.createWriteStream(fileName));
      
      doc
        .font("Times-Bold")
        .text("TABLE OF CONDITIONS OBSERVED", { align: "center" });
      doc.moveDown();
      doc.moveDown(1);
      doc.moveDown(2);

      const t1 = {
        headers: [
          {
            label: `DEVELOPMENT NAME:${project.Name}`,
            property: "name",
            width: 150,
          },

          {
            label: `BUILDING:${project.BuildingAddress}`,
            property: "block",
            width: 150,
          },
          {
            label: `ADDRESS:${project.ProjectAddress}`,
            property: "lot",
            width: 220,
          },
        ],
        datas: [
          {
            name: `BIN: ${project.BIN}`,
            block: `BLOCK No.: ${project.Block}`,
            lot: `LOT No.: ${project.LOT}`,
          },
          {
            name: `INSPECTION DATE:${moment(project.ProjectDate).format(
              "MM/DD/yyyy"
            )}`,
            block: `DOB CONTROL No.: ${project.DOBControlNumber}`,
            lot: `INSPECTING A/E: ${project.AEConsultingInspector}`,
          },
        ],
      };

      doc.table(t1, {
        prepareHeader: () => doc.font("Helvetica-Bold").fontSize(8),
        prepareRow: (indexColumn) => {
          doc.font("Helvetica").fontSize(8);
          indexColumn === 0;
        },
      });

      doc.moveDown(1);
      const table = {
        headers: [
          "Location",
          "Photo No",
          "Condition Description",
          "Causes",
          "Recommendation",
          "Unit",
          "QTY",
        ],

        rows: allAnnotations,
      };

      await doc.table(table, {
        columnsSize: [75, 60, 125, 80, 90, 50, 50],
      });
      doc.end();
      generatedResponse.push(doc);

      var fileContent = fs.createReadStream(fileName);
      fileContent.on("error", function (err) {
        console.log("File Error", err);
      });

      const params = {
        Bucket: "build10x-dev",
        Key: `projects/${Pid}/reports/${datetimestamp}.pdf`,
        Body: fileContent,
      };

      strapi.s3.upload(params, (err, data) => {
        // console.log("data---", data);
        console.log("err---", err);
      });

      await strapi.query("api::report.report").create({
        where: {
          where: { id: Pid },
        },
        data: {
          projectId: Pid,
          name: `${datetimestamp}.pdf`,
        },
      });

      return fileName;
    },



    /////////////////////////////////

    async getDetailedReport(ctx) {
      const Pid = ctx.query.id;
      const elevation = await strapi.db
        .query("api::elevation.elevation")
        .findMany({
          where: { project_id: Pid },
        });

      let allAnnotations = [];
      let allAcAnnotations = [];
      console.log("parsing elevations");
        elevation.map(async (ed) => {
          try {
            const annotationsAc = await strapi.db
              .query("api::annotation.annotation")
              .findMany({
                where: {
                  elevation_id: ed.id,
                  Causes: { $containsi: "WINDOW AC" },
                },
              });

              if(annotationsAc && annotationsAc.length > 0){
                annotationsAc.map( async (item) => {
                  console.log(item)
                  const imageURL = strapi.getObjectPresignedUrl(
                    item.ImagesPath[0]
                  );
            
                  let image = await axios.get(imageURL, {
                    responseType: "arraybuffer",
                  });

                  item.image = image.data;
                  const newItem = item;
                  allAcAnnotations.push(newItem);
                })
              }
            
            const annotations = await strapi.db
              .query("api::annotation.annotation")
              .findMany({
                where: {
                  elevation_id: ed.id,
                  Causes: { $notContainsi: "WINDOW AC" },
                },
              });
              if(annotations && annotations.length > 0){
                annotations.map(async(item) => {
                  const imageURL = strapi.getObjectPresignedUrl(
                    item.ImagesPath[0]
                  );
            
                  let image = await axios.get(imageURL, {
                    responseType: "arraybuffer",
                  });

                  allAnnotations[] = {
                    image: image.data,
                    AnnotationNumber: item.AnnotationNumber,
                    createdAt: item.createdAt,
                    AnnotationObject: item.AnnotationObject,
                    ConditionDescription: item.ConditionDescription,
                    Causes: item.Causes,
                    Recommendation: item.Recommendation,
                    Quantity: item.Quantity,
                  };
                  
                })
              }

              console.log(allAnnotations);

             // this.generatePdf(allAcAnnotations);
              //this.generatePdf(allAnnotations);
              

          } catch (error) {
            console.log("error" + error);
          }
        })

      return elevation;
    },

    async generatePdf(annotations){

      let doc = new PDFDocument({ margin: 30, size: "A4" });

      const datetimestamp = Date.now();
      const fileName = `public/uploads/${datetimestamp}_detailedAnnotations.pdf`;
      doc.pipe(fs.createWriteStream(fileName));

      annotations.map((element) =>{
        doc.image(element.image, {
          width: 500,
          height: 200,
        });
        doc.moveDown();
      doc.moveDown(1);
      doc.moveDown(2);
      const t1 = {
        headers: [
          {
            label: `Photo:${element.AnnotationNumber}`,
            property: "name",
            width: 210,
          },

          {
            label: `Date:${moment(element.createdAt).format(
              "MM/DD/yyyy"
            )}`,
            property: "block",
            width: 150,
          },
          {
            label: `Location:${element.AnnotationObject.position.position}`,
            property: "lot",
            width: 180,
          },
        ],
        datas: [
          {
            name: `Condition Description: ${element.ConditionDescription}`,

            lot: `Recommendation: ${element.Recommendation}`,
          },
          {
            name: `Causes: ${element.Causes}`,

            lot: `Quantity: ${element.Quantity}`,
          },
        ],
      };

      doc.table(t1, {
        prepareHeader: () => doc.font("Helvetica-Bold").fontSize(8),
        prepareRow: (indexColumn) => {
          doc.font("Helvetica").fontSize(8);
          indexColumn === 0;
        },
      });

      doc.addPage();

      });

      
      doc.end();
      generatedResponse.push(doc);
      var fileContent = fs.createReadStream(fileName);
      fileContent.on("error", function (err) {
        console.log("File Error", err);
      });

      const params = {
        Bucket: "build10x-dev",
        Key: `projects/${Pid}/reports/${datetimestamp}_annotations.pdf`,
        Body: fileContent,
      };

      strapi.s3.upload(params, (err, data) => {
        // console.log("data---", data);
        console.log("err---", err);
      });

      return fileName;
    }
  })
);
