module.exports = {
    routes: [
      {
        method: "POST",
        path: "/custom-report/report",
        handler: "report.generateReport",
        config: {
          auth: false,
        },
      },
    ],
  };