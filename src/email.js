import nodemailer from 'nodemailer'
import * as dotenv from 'dotenv'
dotenv.config()

// Function to send email
// Parameters:
// - email : string type email address of the recipient
// - message: string type message body of the email 
export default function sendEmail(email, message) {
    var transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.MAILER_EMAIL,
            pass: process.env.MAILER_PASS
        }
    });

    var mailOptions = {
        from: process.env.MAILER_EMAIL,
        to: email,
        subject: 'Crypto-Bot Updates',
        text: message
    };

    transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
            console.log(error);
        } else {
            console.log('Email sent: ' + info.response);
        }
    });
}

