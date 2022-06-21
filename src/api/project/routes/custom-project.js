module.exports = {
    routes: [
        {
            method: "GET",
            path: "/projects/get-upload-presigned-url",
            handler: "project.getUploadPresignedUrl"
        },
        {
            method: "GET",
            path: "/projects/get-download-presigned-url",
            handler: "project.getDownloadPresignedUrl"
        }
    ]
};

